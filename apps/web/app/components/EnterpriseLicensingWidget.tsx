// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";

export default function EnterpriseLicensingWidget() {
  const [requestedIncrease, setRequestedIncrease] = useState(false);

  const totalAllowed = 5000;
  const currentUsage = 2480;
  const percentUsed = Math.round((currentUsage / totalAllowed) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-white rounded-2xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Enterprise Licensing & Fleet Quotas</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              Active Contract
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Contract ID: <code className="text-slate-700 bg-slate-100 px-1 py-0.5 rounded font-mono">AXM-ENT-2026-9812</code> | SLA: 99.99% Platinum Support
          </p>
        </div>
        <button
          onClick={() => setRequestedIncrease(true)}
          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors shadow-sm whitespace-nowrap"
        >
          {requestedIncrease ? "&check; Request Sent to Account Team" : "Request Quota Increase"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Monitored Workloads Quota */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Monitored NHI Quota</span>
            <span className="text-xs font-bold text-slate-900">{percentUsed}% Used</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">
            {currentUsage.toLocaleString()} <span className="text-sm font-normal text-slate-500">/ {totalAllowed.toLocaleString()}</span>
          </p>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${percentUsed}%` }}
            ></div>
          </div>
          <p className="text-xs text-slate-400">2,520 identity slots remaining on current tier.</p>
        </div>

        {/* Card 2: Gateway Cluster Nodes */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Gateway Fleet</span>
          <p className="text-2xl font-extrabold text-slate-900">
            6 Nodes <span className="text-sm font-normal text-slate-500">in 3 Clusters</span>
          </p>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>us-east-1 (EKS Production)</span>
              <strong className="text-emerald-700 font-mono">3 Pods (Healthy)</strong>
            </div>
            <div className="flex justify-between">
              <span>eu-west-1 (Banking Core)</span>
              <strong className="text-emerald-700 font-mono">2 Pods (Healthy)</strong>
            </div>
            <div className="flex justify-between">
              <span>ap-southeast-1 (Analytics)</span>
              <strong className="text-emerald-700 font-mono">1 Pod (Healthy)</strong>
            </div>
          </div>
        </div>

        {/* Card 3: Subscription & Renewal */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Contract & Entitlements</span>
          <p className="text-xl font-bold text-slate-900">Enterprise Platinum</p>
          <div className="space-y-1 text-xs text-slate-600">
            <p>&check; Unlimited Cedar v4 Policy Bundle Hot-Swaps</p>
            <p>&check; 24/7/365 SOC Incident Response SLA (15 min)</p>
            <p>&check; Universal Secretless Cloud STS Federation</p>
            <p>&check; Annual SOC 2 & ISO 27001 Auditor Package</p>
          </div>
        </div>
      </div>
    </div>
  );
}
