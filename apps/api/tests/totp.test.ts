import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateSecret,
  otpauthUri,
  stepForTime,
  totpCode,
  verifyTotp,
} from "../src/totp";

/** RFC 6238 Appendix B test key: ASCII "12345678901234567890". */
const RFC_SECRET = base32Encode(
  new TextEncoder().encode("12345678901234567890"),
);

describe("base32", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("encodes the RFC key to a known base32 string", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("ignores spaces and lowercase", () => {
    expect(base32Decode("gezd gnbv")).toEqual(base32Decode("GEZDGNBV"));
  });

  it("returns null for invalid input", () => {
    expect(base32Decode("!!!!")).toBeNull();
    expect(base32Decode("")).toBeNull();
    expect(base32Decode("ABC1")).toBeNull(); // 1 is not in the alphabet
  });
});

describe("stepForTime", () => {
  it("matches the RFC 6238 counters", () => {
    expect(stepForTime(59 * 1000)).toBe(1);
    expect(stepForTime(1111111109 * 1000)).toBe(37037036);
    expect(stepForTime(1111111111 * 1000)).toBe(37037037);
    expect(stepForTime(1234567890 * 1000)).toBe(41152263);
    expect(stepForTime(2000000000 * 1000)).toBe(66666666);
    expect(stepForTime(20000000000 * 1000)).toBe(666666666);
  });
});

describe("totpCode — RFC 6238 Appendix B vectors (SHA-1, 6 digits)", () => {
  const vectors: Array<[number, string]> = [
    [1, "287082"],
    [37037036, "081804"],
    [37037037, "050471"],
    [41152263, "005924"],
    [66666666, "279037"],
    [666666666, "353130"],
  ];

  for (const [step, expected] of vectors) {
    it(`step ${step} → ${expected}`, async () => {
      expect(await totpCode(RFC_SECRET, step)).toBe(expected);
    });
  }
});

describe("generateSecret", () => {
  it("produces 32 base32 chars (20 bytes) and varies", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
    expect(base32Decode(a)!.length).toBe(20);
  });
});

describe("verifyTotp", () => {
  const at = (step: number) => step * 30 * 1000;

  it("accepts the current step", async () => {
    const code = await totpCode(RFC_SECRET, 1000);
    expect(await verifyTotp(RFC_SECRET, code, at(1000), -1)).toEqual({
      valid: true,
      step: 1000,
    });
  });

  it("tolerates one step of clock skew either way", async () => {
    const code = await totpCode(RFC_SECRET, 1000);
    expect((await verifyTotp(RFC_SECRET, code, at(1001), -1)).valid).toBe(true);
    expect((await verifyTotp(RFC_SECRET, code, at(999), -1)).valid).toBe(true);
  });

  it("rejects two steps of skew", async () => {
    const code = await totpCode(RFC_SECRET, 1000);
    expect((await verifyTotp(RFC_SECRET, code, at(1002), -1)).valid).toBe(false);
    expect((await verifyTotp(RFC_SECRET, code, at(998), -1)).valid).toBe(false);
  });

  it("rejects a replayed step", async () => {
    const code = await totpCode(RFC_SECRET, 1000);
    expect((await verifyTotp(RFC_SECRET, code, at(1000), 1000)).valid).toBe(
      false,
    );
    expect((await verifyTotp(RFC_SECRET, code, at(1000), 1001)).valid).toBe(
      false,
    );
  });

  it("returns step -1 when invalid", async () => {
    expect(await verifyTotp(RFC_SECRET, "000000", at(1000), -1)).toEqual({
      valid: false,
      step: -1,
    });
  });

  it("accepts Persian digits and embedded spaces", async () => {
    const code = await totpCode(RFC_SECRET, 1000);
    const fa = code.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
    expect((await verifyTotp(RFC_SECRET, fa, at(1000), -1)).valid).toBe(true);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect((await verifyTotp(RFC_SECRET, spaced, at(1000), -1)).valid).toBe(
      true,
    );
  });

  it("rejects malformed input", async () => {
    for (const bad of ["", "12345", "1234567", "abcdef"]) {
      expect((await verifyTotp(RFC_SECRET, bad, at(1000), -1)).valid).toBe(
        false,
      );
    }
  });
});

describe("otpauthUri", () => {
  it("carries the parameters authenticators need", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
    expect(uri).toContain("issuer=Amanatha");
  });
});
