import { createApiKeyHash } from '../src/common/api-key-hash';

async function main() {
  const apiKey = process.argv[2];

  if (!apiKey) {
    console.error('用法: pnpm hash:api-key <明文-api-key>');
    process.exit(1);
  }

  const hash = await createApiKeyHash(apiKey);
  console.log(hash);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
