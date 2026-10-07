"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import regions from "@/data/regions.id.json";

export interface AddressValue {
  provinceCode: string;
  cityCode: string;
  district: string;
  postalCode: string;
  streetAddress: string;
}

export function AddressFields({
  value,
  onChange,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
}) {
  const t = useTranslations("checkout.address");

  const sortedProvinces = useMemo(
    () => [...regions.provinces].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const citiesInProvince = useMemo(
    () =>
      regions.cities
        .filter((c) => c.provinceCode === value.provinceCode)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [value.provinceCode],
  );

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("province")}</span>
        <select
          required
          className="border-brown rounded border px-3 py-2"
          value={value.provinceCode}
          onChange={(e) => {
            // Changing province clears the selected city (FR-015a) — the
            // previous city almost certainly doesn't belong to the new one.
            onChange({ ...value, provinceCode: e.target.value, cityCode: "" });
          }}
        >
          <option value="">{t("provincePlaceholder")}</option>
          {sortedProvinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("city")}</span>
        <select
          required
          className="border-brown rounded border px-3 py-2 disabled:opacity-50"
          value={value.cityCode}
          disabled={!value.provinceCode}
          onChange={(e) => onChange({ ...value, cityCode: e.target.value })}
        >
          <option value="">{t("cityPlaceholder")}</option>
          {citiesInProvince.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("district")}</span>
        <input
          required
          type="text"
          minLength={2}
          maxLength={100}
          className="border-brown rounded border px-3 py-2"
          value={value.district}
          onChange={(e) => onChange({ ...value, district: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("postalCode")}</span>
        <input
          required
          type="text"
          inputMode="numeric"
          pattern="\d{5}"
          minLength={5}
          maxLength={5}
          className="border-brown rounded border px-3 py-2"
          value={value.postalCode}
          onChange={(e) => onChange({ ...value, postalCode: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("streetAddress")}</span>
        <textarea
          required
          minLength={5}
          maxLength={500}
          className="border-brown rounded border px-3 py-2"
          value={value.streetAddress}
          onChange={(e) => onChange({ ...value, streetAddress: e.target.value })}
        />
      </label>
    </div>
  );
}
