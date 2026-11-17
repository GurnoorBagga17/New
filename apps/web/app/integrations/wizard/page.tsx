// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";
import Link from "next/link";

type CloudProvider = "aws" | "azure" | "gcp" | "k8s" | "okta";

interface DiscoveredAsset {
  uid: string;
  name: string;
  kind: string;
  owner: string;
  exposure: "CRITICAL" | "HIGH" | "LOW";
}

export default function OnboardingWizardPage() {
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider>("aws");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isVerifying, setIsVerifying] = useState(false);
  const [discoveredAssets, setDiscoveredAssets] = useState<DiscoveredAsset[]>([]);

  // AWS Configuration Form State
  const [awsAccountId, setAwsAccountId] = useState("123456789012");
  const [awsExternalId] = useState("axm-tenant-9901-ext");
  const [awsRoleArn, setAwsRoleArn] = useState("");

  const handleTestConnection = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      setDiscoveredAssets([
        {
          uid: "arn:aws:iam::123456789012:role/ReportingAgentRole",
          name: "ReportingAgentRole",
          kind: "AI_AGENT_ROLE",
          owner: "sarah.connor@enterprise.com",
          exposure: "HIGH",
        },
        {
          uid: "arn:aws:iam::123456789012:role/LambdaDataTransformer",
          name: "LambdaDataTransformer",
          kind: "SERVICE_ACCOUNT",
          owner: "platform-data@enterprise.com",
          exposure: "LOW",
        },
        {
          uid: "arn:aws:iam::123456789012:role/LegacyPayrollCron",
          name: "LegacyPayrollCron",
          kind: "SHADOW_NHI",
          owner: "ORPHANED (Offboarded Employee)",
          exposure: "CRITICAL",
        },
      ]);
      setStep(3);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-slate-900">AXIOM</span>
              <span className="px-2 py-0.5 text-xs font-semibold tracking-wide bg-indigo-50 text-indigo-700 rounded border border-indigo-100">
                90-SECOND ONBOARDING
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              Connect Infrastructure for Passive NHI Discovery
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Read-only zero-secret inspection. Never stores raw API keys, passwords, or access tokens.
            </p>
          </div>
          <Link
            href="/console"
            className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors hidden sm:inline-block"
          >
            Skip to Console &rarr;
          </Link>
        </header>

        {/* Step Indicator */}
        <nav aria-label="Progress" className="grid grid-cols-3 gap-3">
          <div className={`p-3 rounded-xl border text-center text-xs font-semibold ${
            step >= 1 ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200"
          }`}>
            1. Select Cloud Provider
          </div>
          <div className={`p-3 rounded-xl border text-center text-xs font-semibold ${
            step >= 2 ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200"
          }`}>
            2. 1-Click Read-Only Trust
          </div>
          <div className={`p-3 rounded-xl border text-center text-xs font-semibold ${
            step === 3 ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200"
          }`}>
            3. Automated Discovery Results
          </div>
        </nav>

        {/* Step 1: Provider Selection */}
        {step === 1 && (
          <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h2 className="text-base font-bold text-slate-900">Choose Your Primary Identity Domain</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setSelectedProvider("aws")}
                className={`p-5 rounded-xl border text-left space-y-2 transition-all ${
                  selectedProvider === "aws"
                    ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">Amazon Web Services</span>
                  <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Recommended</span>
                </div>
                <p className="text-xs text-slate-500">IAM Roles, Workload Identifiers, STS Trust, Lambda Agents.</p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedProvider("azure")}
                className={`p-5 rounded-xl border text-left space-y-2 transition-all ${
                  selectedProvider === "azure"
                    ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">Microsoft Azure</span>
                  <span className="text-xs text-slate-400">Entra ID</span>
                </div>
                <p className="text-xs text-slate-500">Service Principals, App Registrations, Managed Identities.</p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedProvider("k8s")}
                className={`p-5 rounded-xl border text-left space-y-2 transition-all ${
                  selectedProvider === "k8s"
                    ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">Kubernetes Cluster</span>
                  <span className="text-xs text-slate-400">Helm</span>
                </div>
                <p className="text-xs text-slate-500">ServiceAccounts, SPIFFE SVIDs, Pod-to-Pod Communication.</p>
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Continue to Setup &rarr;
              </button>
            </div>
          </section>
        )}

        {/* Step 2: 1-Click Infrastructure as Code */}
        {step === 2 && (
          <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Step 2: Deploy Read-Only Cross-Account Trust ({selectedProvider.toUpperCase()})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Grants read-only <code className="text-slate-700 bg-slate-100 px-1 py-0.5 rounded">SecurityAudit</code> permissions. Zero write access.
                </p>
              </div>
              <button onClick={() => setStep(1)} className="text-xs text-slate-400 hover:text-slate-700">Change Provider</button>
            </div>

            {selectedProvider === "aws" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Your AWS Account ID</label>
                    <input
                      type="text"
                      value={awsAccountId}
                      onChange={(e) => setAwsAccountId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Axiom External ID (Tenant Salt)</label>
                    <input
                      type="text"
                      readOnly
                      value={awsExternalId}
                      className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-lg font-mono text-slate-600 focus:outline-none cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* 1-Click Launch Button */}
                <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-indigo-900">Option A: 1-Click AWS CloudFormation Stack</p>
                    <p className="text-xs text-indigo-700">Opens the AWS Management Console with pre-filled parameters.</p>
                  </div>
                  <a
                    href={`https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=AxiomNHIDiscovery&param_ExternalId=${awsExternalId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap"
                  >
                    Launch CloudFormation Stack &rarr;
                  </a>
                </div>

                {/* Terraform Alternative */}
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-700">Option B: Terraform HCL Module</p>
                  <pre className="p-3 bg-slate-900 text-slate-100 text-xs rounded-xl overflow-x-auto font-mono">
{`module "axiom_discovery" {
  source      = "axiom-security/aws-read-only-role/aws"
  external_id = "${awsExternalId}"
  axiom_arn   = "arn:aws:iam::882049102911:root"
}`}
                  </pre>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Created Role ARN</label>
                  <input
                    type="text"
                    placeholder="arn:aws:iam::123456789012:role/AxiomDiscoveryRole"
                    value={awsRoleArn}
                    onChange={(e) => setAwsRoleArn(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
            )}

            {selectedProvider === "azure" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600">Run this Azure CLI command in Cloud Shell to register the read-only enterprise application:</p>
                <pre className="p-3 bg-slate-900 text-slate-100 text-xs rounded-xl overflow-x-auto font-mono">
{`az ad sp create-for-rbac \\
  --name "Axiom-NHI-Discovery" \\
  --role "Reader" \\
  --scopes /subscriptions/YOUR_SUB_ID`}
                </pre>
              </div>
            )}

            {selectedProvider === "k8s" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600">Deploy the read-only cluster role and discovery daemon via Helm:</p>
                <pre className="p-3 bg-slate-900 text-slate-100 text-xs rounded-xl overflow-x-auto font-mono">
{`helm upgrade --install axiom-nhi ./deployments/helm/axiom-nhi \\
  --namespace axiom-system \\
  --set discovery.enabled=true`}
                </pre>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-slate-600 text-sm font-medium hover:text-slate-900 transition-colors"
              >
                &larr; Back
              </button>
              <button
                onClick={handleTestConnection}
                disabled={isVerifying}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {isVerifying ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-r-transparent rounded-full animate-spin"></span>
                    Testing Connection...
                  </>
                ) : (
                  "Test Connection & Discover &rarr;"
                )}
              </button>
            </div>
          </section>
        )}

        {/* Step 3: Immediate Discovery Results */}
        {step === 3 && (
          <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Trust Established & Verified
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  First Automated Discovery Scan Complete!
                </h2>
                <p className="text-xs text-slate-500">
                  Discovered 3 initial Non-Human Identities. Cryptographically salted fingerprints computed.
                </p>
              </div>
              <Link
                href="/console"
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                Open Console Dashboard &rarr;
              </Link>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {discoveredAssets.map((asset, index) => (
                <div key={index} className="p-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{asset.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">{asset.kind}</span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono truncate max-w-md">{asset.uid}</p>
                    <p className="text-xs text-slate-600">Attributed Owner: <strong className="text-slate-800">{asset.owner}</strong></p>
                  </div>
                  <div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      asset.exposure === "CRITICAL"
                        ? "bg-rose-100 text-rose-800"
                        : asset.exposure === "HIGH"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {asset.exposure} RISK
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
              <p>Continuous background polling rate: <strong className="text-slate-800">Every 15 minutes</strong> via TokenBucketLimiter.</p>
              <Link href="/console" className="font-semibold text-slate-900 hover:underline">
                Explore Full Lineage Graph &rarr;
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
