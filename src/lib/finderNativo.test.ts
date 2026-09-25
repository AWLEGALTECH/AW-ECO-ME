import { test, expect } from "bun:test";
import { lerEscolhaDoEndereco } from "./finderNativo";

test("o endereço liga e desliga o Finder novo; sem o parâmetro, não decide", () => {
  expect(lerEscolhaDoEndereco("?nativo=1")).toBe(true);
  expect(lerEscolhaDoEndereco("?cliente=x&nativo=0")).toBe(false);
  expect(lerEscolhaDoEndereco("?cliente=x")).toBeNull();
  expect(lerEscolhaDoEndereco("?nativo=talvez")).toBeNull();
});
