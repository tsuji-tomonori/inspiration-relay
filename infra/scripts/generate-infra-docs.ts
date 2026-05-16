import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HiramekiRelayStack } from "../lib/hirameki-relay-stack";

type CloudFormationResource = {
  Type: string;
  Properties?: Record<string, unknown>;
};

type InventoryResource = {
  logicalId: string;
  type: string;
  purpose: string;
  settings: Record<string, unknown>;
};

type Inventory = {
  generatedBy: string;
  source: string;
  stackName: string;
  totalResources: number;
  totalsByDomain: Array<{ domain: string; count: number }>;
  countsByType: Array<{ type: string; count: number; purpose: string }>;
  resources: InventoryResource[];
};

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const outputDir = join(repoRoot, "docs/infra");
const jsonOutputPath = join(outputDir, "resource-inventory.json");
const markdownOutputPath = join(outputDir, "resource-inventory.md");
const checkOnly = process.argv.includes("--check");
const sensitivePattern = /(secret|password|token|credential|privatekey|apikey)/i;

const typeLabels: Record<string, string> = {
  "AWS::ApiGatewayV2::Api": "API Gateway v2 API",
  "AWS::ApiGatewayV2::Integration": "API Gateway v2 Lambda integration",
  "AWS::ApiGatewayV2::Route": "API Gateway v2 route",
  "AWS::ApiGatewayV2::Stage": "API Gateway v2 stage",
  "AWS::CloudFront::Distribution": "CloudFront distribution",
  "AWS::CloudFront::OriginAccessControl": "CloudFront origin access control",
  "AWS::DynamoDB::Table": "DynamoDB table",
  "AWS::IAM::Policy": "IAM inline policy",
  "AWS::IAM::Role": "IAM role",
  "AWS::Lambda::Function": "Lambda function",
  "AWS::Lambda::Permission": "Lambda invoke permission",
  "AWS::S3::Bucket": "S3 bucket",
  "AWS::S3::BucketPolicy": "S3 bucket policy"
};

const domainTypes: Array<{ domain: string; types: string[] }> = [
  { domain: "Storage", types: ["AWS::S3::Bucket", "AWS::S3::BucketPolicy"] },
  { domain: "Data", types: ["AWS::DynamoDB::Table"] },
  { domain: "Compute", types: ["AWS::Lambda::Function", "AWS::Lambda::Permission"] },
  { domain: "API", types: ["AWS::ApiGatewayV2::Api", "AWS::ApiGatewayV2::Integration", "AWS::ApiGatewayV2::Route", "AWS::ApiGatewayV2::Stage"] },
  { domain: "Delivery", types: ["AWS::CloudFront::Distribution", "AWS::CloudFront::OriginAccessControl"] },
  { domain: "Security/IAM", types: ["AWS::IAM::Role", "AWS::IAM::Policy"] }
];

function synthTemplate(): { Resources?: Record<string, CloudFormationResource> } {
  const app = new App();
  const stack = new HiramekiRelayStack(app, "HiramekiRelayStack");
  return Template.fromStack(stack).toJSON() as Record<string, { Resources?: Record<string, CloudFormationResource> }>;
}

function buildInventory(resources: Record<string, CloudFormationResource>): Inventory {
  const entries = Object.entries(resources)
    .map(([logicalId, resource]) => ({
      logicalId,
      type: resource.Type,
      purpose: typeLabels[resource.Type] ?? "CloudFormation resource",
      settings: summarizeResource(resource)
    }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.logicalId.localeCompare(b.logicalId));

  const countsByType = Object.entries(
    entries.reduce<Record<string, number>>((counts, resource) => {
      counts[resource.type] = (counts[resource.type] ?? 0) + 1;
      return counts;
    }, {})
  )
    .map(([type, count]) => ({ type, count, purpose: typeLabels[type] ?? "CloudFormation resource" }))
    .sort((a, b) => a.type.localeCompare(b.type));

  const countMap = new Map(countsByType.map((item) => [item.type, item.count]));
  const totalsByDomain = domainTypes
    .map(({ domain, types }) => ({
      domain,
      count: types.reduce((sum, type) => sum + (countMap.get(type) ?? 0), 0)
    }))
    .filter((item) => item.count > 0);

  return {
    generatedBy: "infra/scripts/generate-infra-docs.ts",
    source: "infra/lib/hirameki-relay-stack.ts",
    stackName: "HiramekiRelayStack",
    totalResources: entries.length,
    totalsByDomain,
    countsByType,
    resources: entries
  };
}

function summarizeResource(resource: CloudFormationResource): Record<string, unknown> {
  const props = resource.Properties ?? {};
  switch (resource.Type) {
    case "AWS::S3::Bucket":
      return compact({
        encryption: valueAt(props, "BucketEncryption"),
        publicAccessBlock: valueAt(props, "PublicAccessBlockConfiguration"),
        ownershipControls: valueAt(props, "OwnershipControls")
      });
    case "AWS::DynamoDB::Table":
      return compact({
        keySchema: valueAt(props, "KeySchema"),
        attributeDefinitions: valueAt(props, "AttributeDefinitions"),
        billingMode: valueAt(props, "BillingMode"),
        timeToLive: valueAt(props, "TimeToLiveSpecification"),
        globalSecondaryIndexes: valueAt(props, "GlobalSecondaryIndexes")
      });
    case "AWS::Lambda::Function":
      return compact({
        handler: valueAt(props, "Handler"),
        runtime: valueAt(props, "Runtime"),
        architectures: valueAt(props, "Architectures"),
        memorySize: valueAt(props, "MemorySize"),
        timeoutSeconds: valueAt(props, "Timeout"),
        environment: sanitizeObject(valueAt(props, "Environment"))
      });
    case "AWS::ApiGatewayV2::Api":
      return compact({
        name: valueAt(props, "Name"),
        protocolType: valueAt(props, "ProtocolType"),
        routeSelectionExpression: valueAt(props, "RouteSelectionExpression")
      });
    case "AWS::ApiGatewayV2::Route":
      return compact({
        routeKey: valueAt(props, "RouteKey"),
        authorizationType: valueAt(props, "AuthorizationType"),
        target: summarizeValue(valueAt(props, "Target"))
      });
    case "AWS::ApiGatewayV2::Integration":
      return compact({
        integrationType: valueAt(props, "IntegrationType"),
        integrationMethod: valueAt(props, "IntegrationMethod"),
        payloadFormatVersion: valueAt(props, "PayloadFormatVersion"),
        timeoutInMillis: valueAt(props, "TimeoutInMillis")
      });
    case "AWS::ApiGatewayV2::Stage":
      return compact({
        stageName: valueAt(props, "StageName"),
        autoDeploy: valueAt(props, "AutoDeploy")
      });
    case "AWS::CloudFront::Distribution":
      return compact({
        enabled: valueAt(props, "DistributionConfig.Enabled"),
        defaultRootObject: valueAt(props, "DistributionConfig.DefaultRootObject"),
        httpVersion: valueAt(props, "DistributionConfig.HttpVersion"),
        aliases: valueAt(props, "DistributionConfig.Aliases"),
        originCount: asArray(valueAt(props, "DistributionConfig.Origins")).length,
        cacheBehaviors: summarizeCacheBehaviors(valueAt(props, "DistributionConfig.CacheBehaviors"))
      });
    case "AWS::CloudFront::OriginAccessControl":
      return compact({
        name: valueAt(props, "OriginAccessControlConfig.Name"),
        originType: valueAt(props, "OriginAccessControlConfig.OriginAccessControlOriginType"),
        signingBehavior: valueAt(props, "OriginAccessControlConfig.SigningBehavior"),
        signingProtocol: valueAt(props, "OriginAccessControlConfig.SigningProtocol")
      });
    case "AWS::IAM::Role":
      return compact({
        assumedBy: summarizePrincipals(valueAt(props, "AssumeRolePolicyDocument")),
        managedPolicyArns: valueAt(props, "ManagedPolicyArns")
      });
    case "AWS::IAM::Policy":
      return compact({
        policyName: valueAt(props, "PolicyName"),
        roles: summarizeValue(valueAt(props, "Roles")),
        actions: summarizeActions(valueAt(props, "PolicyDocument")),
        resources: summarizeResources(valueAt(props, "PolicyDocument"))
      });
    case "AWS::Lambda::Permission":
      return compact({
        action: valueAt(props, "Action"),
        principal: valueAt(props, "Principal"),
        functionName: summarizeValue(valueAt(props, "FunctionName")),
        sourceArn: summarizeValue(valueAt(props, "SourceArn"))
      });
    case "AWS::S3::BucketPolicy":
      return compact({
        bucket: summarizeValue(valueAt(props, "Bucket")),
        statementCount: asArray(valueAt(props, "PolicyDocument.Statement")).length,
        actions: summarizeActions(valueAt(props, "PolicyDocument")),
        resources: summarizeResources(valueAt(props, "PolicyDocument"))
      });
    default:
      return sanitizeObject(props) as Record<string, unknown>;
  }
}

function summarizeCacheBehaviors(value: unknown): unknown[] {
  return asArray(value).map((item) => {
    if (!item || typeof item !== "object") return summarizeValue(item);
    const behavior = item as Record<string, unknown>;
    return compact({
      pathPattern: behavior.PathPattern,
      allowedMethods: behavior.AllowedMethods,
      cachePolicyId: behavior.CachePolicyId,
      targetOriginId: behavior.TargetOriginId,
      viewerProtocolPolicy: behavior.ViewerProtocolPolicy
    });
  });
}

function valueAt(value: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null)) as T;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function summarizeValue(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(summarizeValue);
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.Ref === "string") return `Ref:${object.Ref}`;
    if (object["Fn::GetAtt"]) return `GetAtt:${asArray(object["Fn::GetAtt"]).join(".")}`;
    if (object["Fn::Sub"]) return `Sub:${String(object["Fn::Sub"]).slice(0, 140)}`;
    return JSON.stringify(sanitizeObject(object)).slice(0, 240);
  }
  return String(value);
}

function sanitizeObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeObject);
  if (!value || typeof value !== "object") return value;
  return compact(Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
    key,
    sensitivePattern.test(key) ? "<masked-or-reference>" : sanitizeObject(nested)
  ])));
}

function summarizePrincipals(policyDocument: unknown): string[] {
  if (!policyDocument || typeof policyDocument !== "object") return [];
  const statements = asArray((policyDocument as Record<string, unknown>).Statement);
  return [...new Set(statements.flatMap((statement) => {
    if (!statement || typeof statement !== "object") return [];
    const principal = (statement as Record<string, unknown>).Principal;
    if (!principal || typeof principal !== "object") return [];
    return Object.entries(principal as Record<string, unknown>).flatMap(([key, value]) =>
      asArray(value).map((item) => `${key}:${String(summarizeValue(item))}`)
    );
  }))].sort();
}

function summarizeActions(policyDocument: unknown): string[] {
  return summarizePolicyField(policyDocument, "Action");
}

function summarizeResources(policyDocument: unknown): string[] {
  return summarizePolicyField(policyDocument, "Resource");
}

function summarizePolicyField(policyDocument: unknown, field: "Action" | "Resource"): string[] {
  if (!policyDocument || typeof policyDocument !== "object") return [];
  const statements = asArray((policyDocument as Record<string, unknown>).Statement);
  return [...new Set(statements.flatMap((statement) => {
    if (!statement || typeof statement !== "object") return [];
    return asArray((statement as Record<string, unknown>)[field]).map((item) => String(summarizeValue(item)));
  }))].sort();
}

function escapeMarkdown(value: unknown): string {
  return JSON.stringify(value ?? "-").replaceAll("|", "\\|");
}

function renderMarkdown(inventory: Inventory): string {
  const lines = [
    "# インフラリソースインベントリ",
    "",
    "<!-- This file is generated by npm run docs:infra. Do not edit manually. -->",
    "",
    `> 自動生成: \`${inventory.generatedBy}\``,
    ">",
    `> 入力: \`${inventory.source}\``,
    ">",
    "> CDK stack を synth した CloudFormation template の静的解析です。deploy 後に AWS 側で追加される実行時データは含みません。",
    "",
    "## 全体サマリ",
    "",
    `- 対象スタック: \`${inventory.stackName}\``,
    `- CloudFormation resources: ${inventory.totalResources}`,
    "",
    "| 領域 | 件数 |",
    "| --- | ---: |",
    ...inventory.totalsByDomain.map((item) => `| ${item.domain} | ${item.count} |`),
    "",
    "## CloudFormation Type 別リソース数",
    "",
    "| Resource type | 個数 | 用途概要 |",
    "| --- | ---: | --- |",
    ...inventory.countsByType.map((item) => `| \`${item.type}\` | ${item.count} | ${item.purpose} |`),
    "",
    "## リソース別主要設定",
    "",
    "| Logical ID | Resource type | 用途概要 | 主要設定 |",
    "| --- | --- | --- | --- |",
    ...inventory.resources.map((resource) =>
      `| \`${resource.logicalId}\` | \`${resource.type}\` | ${resource.purpose} | \`${escapeMarkdown(resource.settings)}\` |`
    ),
    "",
    "## 注意事項",
    "",
    "- `Secret`、`Password`、`Token`、`Credential` などを含むキーは生成時に masked 表記へ寄せています。",
    "- IAM policy は action と resource の要約です。condition や intrinsic function の完全な評価は CDK / CloudFormation template を確認してください。",
    "- インフラ実装を変更した場合は `npm run docs:infra` と `npm run docs:check` を実行してください。"
  ];
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const template = synthTemplate();
  const resources = template.Resources ?? {};
  const inventory = buildInventory(resources);
  const json = `${JSON.stringify(inventory, null, 2)}\n`;
  const markdown = renderMarkdown(inventory);

  if (checkOnly) {
    const mismatches: string[] = [];
    try {
      if (await readFile(jsonOutputPath, "utf8") !== json) mismatches.push("docs/infra/resource-inventory.json");
    } catch {
      mismatches.push("docs/infra/resource-inventory.json");
    }
    try {
      if (await readFile(markdownOutputPath, "utf8") !== markdown) mismatches.push("docs/infra/resource-inventory.md");
    } catch {
      mismatches.push("docs/infra/resource-inventory.md");
    }
    if (mismatches.length > 0) {
      console.error("Infra docs are out of date:");
      for (const mismatch of mismatches) console.error(`- ${mismatch}`);
      console.error("Run npm run docs:infra.");
      process.exitCode = 1;
      return;
    }
    console.log("Infra docs are up to date.");
    return;
  }

  await mkdir(outputDir, { recursive: true });
  await rm(jsonOutputPath, { force: true });
  await rm(markdownOutputPath, { force: true });
  await writeFile(jsonOutputPath, json);
  await writeFile(markdownOutputPath, markdown);
  console.log(`Generated ${jsonOutputPath}`);
  console.log(`Generated ${markdownOutputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
