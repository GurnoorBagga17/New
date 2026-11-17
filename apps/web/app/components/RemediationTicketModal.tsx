// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";

export interface FindingItem {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  workload: string;
  owner: string;
  suggestedAction: string;
}

interface RemediationTicketModalProps {
  finding: FindingItem | null;
  onClose: () => void;
  onTicketCreated: (ticketId: string, platform: "Jira" | "ServiceNow") => void;
}

export default function RemediationTicketModal({
  finding,
  onClose,
  onTicketCreated,
}: RemediationTicketModalProps) {
  const [platform, setPlatform] = useState<"Jira" | "ServiceNow">("Jira");
  const [jiraProject, setJiraProject] = useState("SEC");
  const [assignee, setAssignee] = useState(finding?.owner || "security-team@enterprise.com");
  const [priority, setPriority] = useState(finding?.severity === "CRITICAL" ? "Highest" : "High");
  const [submitting, setSubmitting] = useState(false);

  if (!finding) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      const generatedId = platform === "Jira"
        ? `${jiraProject}-${Math.floor(1000 + Math.random() * 9000)}`
        : `INC${Math.floor(1000000 + Math.random() * 9000000)}`;
      onTicketCreated(generatedId, platform);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                {finding.severity}
              </span>
              <h3 className="text-base font-bold text-slate-900">
                Dispatch Automated Remediation Ticket
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Closed-loop ITSM workflow with 14-day SLA and Cedar policy binding.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg font-bold"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target System Toggle */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Target ITSM Platform</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPlatform("Jira")}
                className={`py-2 px-4 rounded-xl text-xs font-bold border transition-colors ${
                  platform === "Jira"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                Atlassian Jira Software
              </button>
              <button
                type="button"
                onClick={() => setPlatform("ServiceNow")}
                className={`py-2 px-4 rounded-xl text-xs font-bold border transition-colors ${
                  platform === "ServiceNow"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                ServiceNow ITSM
              </button>
            </div>
          </div>

          {/* Finding Summary (Read Only) */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
            <p className="font-semibold text-slate-800">Summary: {finding.title}</p>
            <p className="text-slate-500 font-mono">Workload: {finding.workload}</p>
            <p className="text-emerald-800 font-medium">Recommended Action: {finding.suggestedAction}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {platform === "Jira" ? "Jira Project Key" : "Assignment Group"}
              </label>
              <input
                type="text"
                value={jiraProject}
                onChange={(e) => setJiraProject(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="Highest">Highest (P0 - 24h SLA)</option>
                <option value="High">High (P1 - 7d SLA)</option>
                <option value="Medium">Medium (P2 - 14d SLA)</option>
                <option value="Low">Low (P3 - 30d SLA)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Attributed Developer Assignee</label>
            <input
              type="email"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {submitting ? "Dispatching..." : `Create ${platform} Ticket &rarr;`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
