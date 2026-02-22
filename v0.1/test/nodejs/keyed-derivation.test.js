import test from "node:test";
import assert from "node:assert/strict";

import { MlKem768 } from "mlkem";

import {
  computeDataIdKeyed,
  deriveKemSeedBytes,
  deriveKeyIdBytes,
  deriveMasterKeyBytes,
  normalizeIdentifier,
} from "../../src/protocol.js";

test("computeDataIdKeyed is stable across normalization", () => {
  const passphrase = "passphrase-keyed";
  const masterKey = deriveMasterKeyBytes(passphrase);
  const keyId = deriveKeyIdBytes(masterKey);

  const idA = "  my-note  ";
  const idB = "my-note";
  const dataIdA = computeDataIdKeyed(keyId, idA);
  const dataIdB = computeDataIdKeyed(keyId, idB);

  assert.equal(dataIdA, dataIdB);
});

test("computeDataIdKeyed rejects empty identifiers", () => {
  const passphrase = "passphrase-keyed-empty";
  const masterKey = deriveMasterKeyBytes(passphrase);
  const keyId = deriveKeyIdBytes(masterKey);

  assert.throws(() => computeDataIdKeyed(keyId, "   "));
});

test("per-secret ML-KEM keys are deterministic per identifier", async () => {
  const passphrase = "passphrase-derivation";
  const masterKey = deriveMasterKeyBytes(passphrase);

  const idA = normalizeIdentifier("alpha");
  const idB = normalizeIdentifier("beta");

  const seedA1 = deriveKemSeedBytes(masterKey, idA);
  const seedA2 = deriveKemSeedBytes(masterKey, idA);
  const seedB = deriveKemSeedBytes(masterKey, idB);

  const kem = new MlKem768();
  const [pubA1] = await kem.deriveKeyPair(seedA1);
  const [pubA2] = await kem.deriveKeyPair(seedA2);
  const [pubB] = await kem.deriveKeyPair(seedB);

  assert.equal(Buffer.from(pubA1).toString("hex"), Buffer.from(pubA2).toString("hex"));
  assert.notEqual(Buffer.from(pubA1).toString("hex"), Buffer.from(pubB).toString("hex"));
});
