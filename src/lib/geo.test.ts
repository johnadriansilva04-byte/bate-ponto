import { describe, expect, it } from "vitest";
import {
  avaliarLocal,
  decidirAviso,
  distanceMeters,
  formatDistancia,
  type GeoFix,
  type GeoStatus,
  type LocalPrevisto,
} from "./geo";

// AV MAURO RAMOS 765, Centro, Florianópolis - SC
const CASA = { latitude: -27.5958794, longitude: -48.543594 };

const local = (over: Partial<LocalPrevisto> = {}): LocalPrevisto => ({
  endereco: "AV MAURO RAMOS 765, CENTRO, FLORIANÓPOLIS - SC",
  latitude: CASA.latitude,
  longitude: CASA.longitude,
  raioMetros: 300,
  ...over,
});

const fix = (lat: number | null, lng: number | null, status: GeoStatus = "ok"): GeoFix => ({
  latitude: lat,
  longitude: lng,
  status,
  accuracy: null,
});

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters(CASA.latitude, CASA.longitude, CASA.latitude, CASA.longitude)).toBe(0);
  });

  it("measures a known short distance within a few metres", () => {
    // ~0.001 deg of latitude is about 111 m.
    const d = distanceMeters(CASA.latitude, CASA.longitude, CASA.latitude + 0.001, CASA.longitude);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it("measures a known long distance (Florianópolis to São Paulo ~ 490 km)", () => {
    const d = distanceMeters(-27.5958, -48.5435, -23.5505, -46.6333);
    expect(d / 1000).toBeGreaterThan(470);
    expect(d / 1000).toBeLessThan(520);
  });

  it("is symmetric", () => {
    const a = distanceMeters(-27.59, -48.54, -23.55, -46.63);
    const b = distanceMeters(-23.55, -46.63, -27.59, -48.54);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });
});

describe("avaliarLocal", () => {
  it("marks a tap inside the radius as inside", () => {
    const r = avaliarLocal(fix(CASA.latitude + 0.0005, CASA.longitude), local());
    expect(r.fora).toBe(false);
    expect(r.distancia).toBeGreaterThan(0);
    expect(r.distancia!).toBeLessThan(300);
  });

  it("marks a tap well beyond the radius as outside and reports the distance", () => {
    // ~1.1 km north of the workplace.
    const r = avaliarLocal(fix(CASA.latitude + 0.01, CASA.longitude), local());
    expect(r.fora).toBe(true);
    expect(r.distancia!).toBeGreaterThan(1000);
  });

  it("uses the radius as the boundary, not a hard-coded value", () => {
    const ponto = fix(CASA.latitude + 0.005, CASA.longitude); // ~555 m
    expect(avaliarLocal(ponto, local({ raioMetros: 300 })).fora).toBe(true);
    expect(avaliarLocal(ponto, local({ raioMetros: 1000 })).fora).toBe(false);
  });

  it("never accuses when there is no GPS fix", () => {
    const semSinal: GeoStatus[] = ["negado", "indisponivel", "expirado", "sem_suporte"];
    for (const status of semSinal) {
      const r = avaliarLocal(fix(null, null, status), local());
      expect(r.fora).toBe(false);
      expect(r.distancia).toBeNull();
    }
    expect(avaliarLocal(null, local()).fora).toBe(false);
  });

  it("never accuses when the workplace has no saved coordinate", () => {
    const r = avaliarLocal(
      fix(CASA.latitude + 0.01, CASA.longitude),
      local({ latitude: null, longitude: null }),
    );
    expect(r.fora).toBe(false);
    expect(r.distancia).toBeNull();
  });

  it("never accuses when there is no workplace at all", () => {
    expect(avaliarLocal(fix(CASA.latitude, CASA.longitude), null).fora).toBe(false);
  });
});

describe("formatDistancia", () => {
  it("shows metres below 1 km and kilometres above", () => {
    expect(formatDistancia(340)).toBe("340 m");
    expect(formatDistancia(999)).toBe("999 m");
    expect(formatDistancia(1000)).toBe("1 km");
    expect(formatDistancia(2340)).toBe("2,3 km");
  });
});

describe("decidirAviso", () => {
  it("warns with the distance and which punch was outside", () => {
    const longe = fix(CASA.latitude + 0.01, CASA.longitude); // ~1,1 km ao sul
    const entrada = decidirAviso(longe, local(), false);
    expect(entrada?.distancia).toBeGreaterThan(1000);
    expect(entrada?.toque).toBe("entrada");
    expect(entrada?.previsto.endereco).toBe(local().endereco);

    expect(decidirAviso(longe, local(), true)?.toque).toBe("saida");
  });

  it("stays silent inside the radius", () => {
    expect(decidirAviso(fix(CASA.latitude + 0.0005, CASA.longitude), local(), false)).toBeNull();
  });

  it("stays silent without proof: no GPS, no coordinate, or no workplace", () => {
    expect(decidirAviso(fix(null, null, "negado"), local(), false)).toBeNull();
    expect(decidirAviso(null, local(), false)).toBeNull();
    expect(
      decidirAviso(fix(CASA.latitude + 0.01, CASA.longitude), local({ latitude: null }), false),
    ).toBeNull();
    expect(decidirAviso(fix(CASA.latitude + 0.01, CASA.longitude), null, false)).toBeNull();
  });
});
