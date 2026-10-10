import bcrypt from "bcryptjs";

const ROUNDS = 12;

export { passwordSchema } from "@/schemas/auth";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Used to keep login timing constant when the user doesn't exist.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= bcrypt.hash("timing-equalizer-password", ROUNDS);
  await bcrypt.compare(password, await dummyHash);
}
