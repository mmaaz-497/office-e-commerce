/**
 * Prints a bcrypt hash for ADMIN_PASSWORD_HASH. The admin credential is never
 * stored as plaintext (FR-054, Constitution Principle IX).
 *
 * Usage: npm run hash-password -- 'your-password-here'
 */
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

async function main() {
  const password = process.argv[2];

  if (!password) {
    console.error("Usage: npm run hash-password -- 'your-password-here'");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  console.log(hash);
}

main();
