// Linkittää testikorvikkeen node_modules-kansioon (vain paikallisesti).
import { mkdirSync, symlinkSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
const target = resolve("node_modules/@netlify/blobs");
mkdirSync(resolve("node_modules/@netlify"), { recursive: true });
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
symlinkSync(resolve("test/mock/@netlify/blobs"), target, "dir");
