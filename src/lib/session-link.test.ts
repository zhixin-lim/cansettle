import { describe, expect, it } from "vitest";

import { parseSessionParam, withoutSessionParam } from "./session-link";

const ID = "2b83b585-01ee-4333-b823-907f724d9abe";

describe("parseSessionParam", () => {
  it("reads a valid session id", () => {
    expect(parseSessionParam(`?session=${ID}`)).toBe(ID);
  });
  it("works alongside other parameters", () => {
    expect(parseSessionParam(`?x=1&session=${ID}&y=2`)).toBe(ID);
  });
  it("ignores a missing, empty or malformed id", () => {
    expect(parseSessionParam("")).toBeNull();
    expect(parseSessionParam("?session=")).toBeNull();
    expect(parseSessionParam("?session=abc")).toBeNull();
    expect(parseSessionParam("?session=../../etc/passwd")).toBeNull();
    expect(parseSessionParam(`?session=${ID}extra`)).toBeNull();
  });
});

describe("withoutSessionParam", () => {
  it("drops only the session parameter", () => {
    expect(withoutSessionParam(`https://x.app/settle/bills?session=${ID}&a=1#top`)).toBe(
      "/settle/bills?a=1#top",
    );
  });
  it("leaves a plain URL alone", () => {
    expect(withoutSessionParam("https://x.app/")).toBe("/");
  });
});
