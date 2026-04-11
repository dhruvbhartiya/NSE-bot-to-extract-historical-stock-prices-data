@echo off
echo ============================================
echo   NSE Lambda Deployment
echo ============================================

set FUNCTION_NAME=nse-historical-data
set S3_BUCKET=nse-historical-downloads-dhruv
set REGION=ap-south-1
set ROLE_NAME=nse-lambda-role
set API_NAME=nse-historical-api

echo.
echo [1/6] Creating S3 bucket...
aws s3api create-bucket --bucket %S3_BUCKET% --region %REGION% --create-bucket-configuration LocationConstraint=%REGION% 2>nul
echo   S3 bucket ready.

echo.
echo [2/6] Adding auto-cleanup rule to S3...
echo {"Rules":[{"ID":"DeleteAfter1Day","Status":"Enabled","Filter":{"Prefix":"downloads/"},"Expiration":{"Days":1}}]} > lifecycle.json
aws s3api put-bucket-lifecycle-configuration --bucket %S3_BUCKET% --lifecycle-configuration file://lifecycle.json --region %REGION%
del lifecycle.json
echo   Auto-cleanup set (files delete after 24h).

echo.
echo [3/6] Creating IAM role for Lambda...
echo {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]} > trust.json
aws iam create-role --role-name %ROLE_NAME% --assume-role-policy-document file://trust.json 2>nul
aws iam attach-role-policy --role-name %ROLE_NAME% --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>nul
aws iam attach-role-policy --role-name %ROLE_NAME% --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess 2>nul
del trust.json

for /f "tokens=*" %%i in ('aws iam get-role --role-name %ROLE_NAME% --query "Role.Arn" --output text') do set ROLE_ARN=%%i
echo   IAM role ready: %ROLE_ARN%

echo.
echo [4/6] Building Lambda package with Docker...
echo   This may take a few minutes...

docker run --rm -v "%cd%":/src -w /src public.ecr.aws/lambda/python:3.12 bash -c "pip install jugaad-data pandas openpyxl boto3 -t /src/package/ --quiet && echo Done installing"

cd package
copy ..\handler.py . >nul
tar -acf ..\lambda-package.zip *
cd ..
echo   Package built.

echo.
echo [5/6] Deploying Lambda function...
timeout /t 10 /nobreak >nul

aws lambda create-function --function-name %FUNCTION_NAME% --runtime python3.12 --handler handler.lambda_handler --role %ROLE_ARN% --zip-file fileb://lambda-package.zip --timeout 300 --memory-size 512 --environment "Variables={S3_BUCKET=%S3_BUCKET%}" --region %REGION% 2>nul || aws lambda update-function-code --function-name %FUNCTION_NAME% --zip-file fileb://lambda-package.zip --region %REGION%
echo   Lambda deployed.

echo.
echo [6/6] Creating API Gateway...
for /f "tokens=*" %%i in ('aws apigateway create-rest-api --name %API_NAME% --region %REGION% --query "id" --output text 2^>nul') do set API_ID=%%i
if "%API_ID%"=="" (
    for /f "tokens=*" %%i in ('aws apigateway get-rest-apis --region %REGION% --query "items[?name=='%API_NAME%'].id | [0]" --output text') do set API_ID=%%i
)

for /f "tokens=*" %%i in ('aws apigateway get-resources --rest-api-id %API_ID% --region %REGION% --query "items[?path=='/'].id | [0]" --output text') do set ROOT_ID=%%i

aws apigateway create-resource --rest-api-id %API_ID% --parent-id %ROOT_ID% --path-part extract --region %REGION% 2>nul
for /f "tokens=*" %%i in ('aws apigateway get-resources --rest-api-id %API_ID% --region %REGION% --query "items[?pathPart=='extract'].id | [0]" --output text') do set RESOURCE_ID=%%i

aws apigateway put-method --rest-api-id %API_ID% --resource-id %RESOURCE_ID% --http-method POST --authorization-type NONE --region %REGION% 2>nul
aws apigateway put-method --rest-api-id %API_ID% --resource-id %RESOURCE_ID% --http-method OPTIONS --authorization-type NONE --region %REGION% 2>nul

for /f "tokens=*" %%i in ('aws sts get-caller-identity --query "Account" --output text') do set ACCOUNT_ID=%%i
set LAMBDA_URI=arn:aws:apigateway:%REGION%:lambda:path/2015-03-31/functions/arn:aws:lambda:%REGION%:%ACCOUNT_ID%:function:%FUNCTION_NAME%/invocations

aws apigateway put-integration --rest-api-id %API_ID% --resource-id %RESOURCE_ID% --http-method POST --type AWS_PROXY --integration-http-method POST --uri %LAMBDA_URI% --region %REGION% 2>nul
aws apigateway put-integration --rest-api-id %API_ID% --resource-id %RESOURCE_ID% --http-method OPTIONS --type AWS_PROXY --integration-http-method POST --uri %LAMBDA_URI% --region %REGION% 2>nul

aws lambda add-permission --function-name %FUNCTION_NAME% --statement-id apigateway-invoke --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:%REGION%:%ACCOUNT_ID%:%API_ID%/*" --region %REGION% 2>nul

aws apigateway create-deployment --rest-api-id %API_ID% --stage-name prod --region %REGION%

echo.
echo ============================================
echo   Deployment Complete!
echo ============================================
echo.
echo API URL: https://%API_ID%.execute-api.%REGION%.amazonaws.com/prod/extract
echo.
echo Save this URL - you will need it for Vercel!
echo.

rmdir /s /q package 2>nul
del lambda-package.zip 2>nul

pause
