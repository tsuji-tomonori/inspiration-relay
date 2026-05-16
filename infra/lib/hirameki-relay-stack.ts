import { Duration, Fn, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { HttpApi, HttpMethod, WebSocketApi, WebSocketStage } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration, WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AllowedMethods, CachePolicy, Distribution, OriginProtocolPolicy, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Architecture, Code, Function as LambdaFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class HiramekiRelayStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const siteBucket = new Bucket(this, "SiteBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN
    });

    const gameTable = new Table(this, "GameTable", {
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.RETAIN
    });

    const connectionTable = new Table(this, "ConnectionTable", {
      partitionKey: { name: "connectionId", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.RETAIN
    });

    connectionTable.addGlobalSecondaryIndex({
      indexName: "ByRoom",
      partitionKey: { name: "GSI1PK", type: AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: AttributeType.STRING }
    });

    const apiFunction = new LambdaFunction(this, "ApiFunction", {
      code: Code.fromAsset("../apps/api/dist"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        GAME_TABLE_NAME: gameTable.tableName,
        CONNECTION_TABLE_NAME: connectionTable.tableName
      }
    });

    const wsConnectFunction = new LambdaFunction(this, "WsConnectFunction", {
      code: Code.fromAsset("../apps/api/dist"),
      handler: "ws-handler.connectHandler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(5),
      environment: {
        CONNECTION_TABLE_NAME: connectionTable.tableName
      }
    });

    const wsDisconnectFunction = new LambdaFunction(this, "WsDisconnectFunction", {
      code: Code.fromAsset("../apps/api/dist"),
      handler: "ws-handler.disconnectHandler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(5),
      environment: {
        CONNECTION_TABLE_NAME: connectionTable.tableName
      }
    });

    const wsMessageFunction = new LambdaFunction(this, "WsMessageFunction", {
      code: Code.fromAsset("../apps/api/dist"),
      handler: "ws-handler.messageHandler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(10),
      environment: {
        GAME_TABLE_NAME: gameTable.tableName,
        CONNECTION_TABLE_NAME: connectionTable.tableName
      }
    });

    gameTable.grantReadWriteData(apiFunction);
    gameTable.grantReadWriteData(wsMessageFunction);
    connectionTable.grantReadWriteData(apiFunction);
    connectionTable.grantReadWriteData(wsConnectFunction);
    connectionTable.grantReadWriteData(wsDisconnectFunction);
    connectionTable.grantReadWriteData(wsMessageFunction);

    const httpApi = new HttpApi(this, "HttpApi", {
      apiName: "hirameki-relay-http-api"
    });

    httpApi.addRoutes({
      path: "/api/{proxy+}",
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration("ApiIntegration", apiFunction)
    });

    const websocketApi = new WebSocketApi(this, "WebSocketApi", {
      apiName: "hirameki-relay-websocket-api",
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration("ConnectIntegration", wsConnectFunction)
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration("DisconnectIntegration", wsDisconnectFunction)
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration("DefaultIntegration", wsMessageFunction)
      }
    });

    const websocketStage = new WebSocketStage(this, "WebSocketStage", {
      webSocketApi: websocketApi,
      stageName: "v1",
      autoDeploy: true
    });

    const httpDomain = Fn.select(2, Fn.split("/", httpApi.apiEndpoint));
    const wsDomain = Fn.select(2, Fn.split("/", websocketStage.url));

    new Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      additionalBehaviors: {
        "api/*": {
          origin: new HttpOrigin(httpDomain, {
            protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY
          }),
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
        },
        "ws/*": {
          origin: new HttpOrigin(wsDomain, {
            protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
            originPath: "/v1"
          }),
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
        }
      }
    });
  }
}
