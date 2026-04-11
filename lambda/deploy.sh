#!/bin/bash
# ============================================================
#  NSE Historical Data — AWS Lambda Deployment Script
# ============================================================
#
# Prerequisites:
#   1. AWS CLI installed and configured (aws configure)
#   2. Docker installed (for building Lambda layer)
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
# ============================================================

set -e

FUNCTION_NAME="nse-historical-data"
S3_BUCKET="nse-historical-downloads"
REGION="ap-south-1"  # Mumbai region (closest to NSE)
ROLE_NAME="nse-lambda-role"
API_NAME="nse-historical-api"

echo "============================================"
echo "  NSE Lambda Deployment"
echo "============================================"

# Step 1: Create S3 bucket
echo ""
echo "[1/6] Creating S3 bucket..."
aws s3api create-bucket \
    --bucket $S3_BUCKET \
    --region $REGION \
    --create-bucket-configuration LocationConstraint=$REGION \
    2>/dev/null || echo "  Bucket already exists."

# Add lifecycle rule to auto-delete files after 1 day
aws s3api put-bucket-lifecycle-configuration \
    --bucket $S3_BUCKET \
    --lifecycle-configuration '{
        "Rules": [{
            "ID": "DeleteAfter1Day",
            "Status": "Enabled",
            "Filter": {"Prefix": "downloads/"},
            "Expiration": {"Days": 1}
        }]
    }'
echo "  S3 bucket ready with 1-day auto-cleanup."

# Step 2: Create IAM role
echo ""
echo "[2/6] Creating IAM role..."
TRUST_POLICY='{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "lambda.amazonaws.com"},
        "Action": "sts:AssumeRole"
    }]
}'

ROLE_ARN=$(aws iam create-role \
    --role-name $ROLE_NAME \
    --assume-role-policy-document "$TRUST_POLICY" \
    --query 'Role.Arn' --output text 2>/dev/null) || \
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)

# Attach policies
aws iam attach-role-policy --role-name $ROLE_NAME \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true
aws iam attach-role-policy --role-name $ROLE_NAME \
    --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess 2>/dev/null || true

echo "  IAM role ready: $ROLE_ARN"

# Step 3: Build Lambda package using Docker
echo ""
echo "[3/6] Building Lambda deployment package..."
rm -rf /tmp/lambda-build
mkdir -p /tmp/lambda-build

# Install dependencies in a Docker container matching Lambda runtime
docker run --rm -v /tmp/lambda-build:/out -v "$(pwd):/src" \
    public.ecr.aws/lambda/python:3.12 \
    bash -c "pip install -r /src/requirements.txt -t /out/python && cp /src/handler.py /out/"

cd /tmp/lambda-build
zip -r9 /tmp/nse-lambda.zip . -x "*.pyc" "__pycache__/*"
cd -

echo "  Package built: /tmp/nse-lambda.zip"

# Step 4: Create/Update Lambda function
echo ""
echo "[4/6] Deploying Lambda function..."
sleep 10  # Wait for IAM role to propagate

aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --runtime python3.12 \
    --handler handler.lambda_handler \
    --role $ROLE_ARN \
    --zip-file fileb:///tmp/nse-lambda.zip \
    --timeout 300 \
    --memory-size 512 \
    --environment "Variables={S3_BUCKET=$S3_BUCKET}" \
    --region $REGION \
    2>/dev/null || \
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb:///tmp/nse-lambda.zip \
    --region $REGION

echo "  Lambda function deployed."

# Step 5: Create API Gateway
echo ""
echo "[5/6] Setting up API Gateway..."
API_ID=$(aws apigateway create-rest-api \
    --name $API_NAME \
    --region $REGION \
    --query 'id' --output text 2>/dev/null) || \
API_ID=$(aws apigateway get-rest-apis --region $REGION \
    --query "items[?name=='$API_NAME'].id | [0]" --output text)

ROOT_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION \
    --query 'items[?path==`/`].id | [0]' --output text)

# Create /extract resource
RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ROOT_ID \
    --path-part "extract" \
    --region $REGION \
    --query 'id' --output text 2>/dev/null) || \
RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION \
    --query "items[?pathPart=='extract'].id | [0]" --output text)

# Create POST method
aws apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --authorization-type NONE \
    --region $REGION 2>/dev/null || true

# Create OPTIONS method for CORS
aws apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --authorization-type NONE \
    --region $REGION 2>/dev/null || true

ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
LAMBDA_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNCTION_NAME"

# Integrate POST with Lambda
aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" \
    --region $REGION 2>/dev/null || true

# Integrate OPTIONS with Lambda
aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" \
    --region $REGION 2>/dev/null || true

# Grant API Gateway permission to invoke Lambda
aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*" \
    --region $REGION 2>/dev/null || true

# Deploy API
aws apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name prod \
    --region $REGION

API_URL="https://$API_ID.execute-api.$REGION.amazonaws.com/prod/extract"
echo "  API Gateway deployed."

# Step 6: Summary
echo ""
echo "============================================"
echo "  Deployment Complete!"
echo "============================================"
echo ""
echo "API Endpoint: $API_URL"
echo ""
echo "Test with:"
echo "  curl -X POST $API_URL \\"
echo '    -H "Content-Type: application/json" \'
echo '    -d '"'"'{"symbol":"TCS","from_date":"01-04-2025","to_date":"31-03-2026"}'"'"
echo ""
echo "Set this as NEXT_PUBLIC_API_URL in your Vercel environment."
