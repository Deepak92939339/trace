"use client";

import React from "react";
import { MarginMeter } from "@/components/quotes/builder/margin-meter";
import { formatBasisPoints } from "@/lib/formatting/basis-points";
import catalogStyles from "@/components/catalog/catalog.module.css";
import styles from "./b3-preview.module.css";

export function B10aPreview() {
  return (
    <section className={styles.section} aria-labelledby="b10a-title">
      <h2 id="b10a-title" className={styles.title}>
        <span>Cost price and margin (B10a)</span>
        <span className={styles.hint}>
          MarginMeter · Catalog Cost Column · Organization Margin Floor
        </span>
      </h2>

      {/* 1. MarginMeter static samples */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          1. MarginMeter: Positive margin above floor
        </h3>
        <div style={{ maxWidth: 340, background: "var(--surface)", padding: 16, border: "1px solid var(--line)", borderRadius: "var(--r-panel)" }}>
          <MarginMeter
            margin={{
              marginBps: 3450,
              floorBps: 2000,
              linesWithoutCost: 0,
              belowCost: false,
              underFloor: false,
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          2. MarginMeter: Margin under floor (needs approval)
        </h3>
        <div style={{ maxWidth: 340, background: "var(--surface)", padding: 16, border: "1px solid var(--line)", borderRadius: "var(--r-panel)" }}>
          <MarginMeter
            margin={{
              marginBps: 1820,
              floorBps: 2500,
              linesWithoutCost: 1,
              belowCost: false,
              underFloor: true,
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          3. MarginMeter: Negative margin below cost (needs approval)
        </h3>
        <div style={{ maxWidth: 340, background: "var(--surface)", padding: 16, border: "1px solid var(--line)", borderRadius: "var(--r-panel)" }}>
          <MarginMeter
            margin={{
              marginBps: -450,
              floorBps: 1500,
              linesWithoutCost: 0,
              belowCost: true,
              underFloor: true,
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          4. MarginMeter: No catalog costs yet
        </h3>
        <div style={{ maxWidth: 340, background: "var(--surface)", padding: 16, border: "1px solid var(--line)", borderRadius: "var(--r-panel)" }}>
          <MarginMeter margin={null} />
        </div>
      </div>

      {/* 2. Catalog cost column */}
      <div style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          5. Catalog table with internal Cost column (canReadMargin = true)
        </h3>
        <div
          className="table-region"
          tabIndex={0}
          role="region"
          aria-label="Catalog table"
        >
          <table className={catalogStyles.catalogTable}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>Unit</th>
                <th>Unit price</th>
                <th>Cost</th>
                <th>Tax profile</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mono" data-label="SKU">
                  IND-MTR-001
                </td>
                <td data-label="Description">3-Phase Induction Motor 5HP</td>
                <td data-label="Unit">EA</td>
                <td className="money" data-label="Unit price">
                  $1,250.00
                </td>
                <td className="money" data-label="Cost">
                  $820.00
                </td>
                <td data-label="Tax profile">STANDARD</td>
                <td data-label="State">Active</td>
              </tr>
              <tr>
                <td className="mono" data-label="SKU">
                  SRV-INST-002
                </td>
                <td data-label="Description">Site Installation and Calibration</td>
                <td data-label="Unit">EA</td>
                <td className="money" data-label="Unit price">
                  $450.00
                </td>
                <td className="money" data-label="Cost">
                  —
                </td>
                <td data-label="Tax profile">SERVICE</td>
                <td data-label="State">Active</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Organization Settings margin floor input */}
      <div style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          6. Organization settings: Margin floor input (canReadMargin = true)
        </h3>
        <div
          style={{
            maxWidth: 600,
            background: "var(--surface)",
            padding: 24,
            border: "1px solid var(--line)",
            borderRadius: "var(--r-panel)",
          }}
        >
          <div className="form-grid">
            <label>
              Approval threshold (basis points)
              <input
                type="number"
                inputMode="numeric"
                defaultValue={1000}
                min={0}
                max={10000}
                step={1}
                readOnly
              />
            </label>
            <label>
              Margin floor (basis points)
              <input
                name="marginFloorBps"
                type="number"
                inputMode="numeric"
                defaultValue={2500}
                min={0}
                max={10000}
                step={1}
              />
              <small>{formatBasisPoints(2500)}</small>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
