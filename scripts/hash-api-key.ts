import { createHash } from 'node:crypto';

function main() {
  const apiKey = process.argv[2];

  if (!apiKey) {
    console.error('用法: pnpm hash:api-key <明文-api-key>');
    process.exit(1);
  }

  const hash = createHash('sha256').update(apiKey).digest('hex');
  console.log(hash);
}

main();
