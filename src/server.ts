import app from './app.js';
import { env } from './lib/env.js';
import { prisma } from './prisma/client.js';

async function main() {
  await prisma.$connect();
  app.listen(env.PORT, () => {
    console.log(`Easy Split backend running on port ${env.PORT}`);
  });
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
