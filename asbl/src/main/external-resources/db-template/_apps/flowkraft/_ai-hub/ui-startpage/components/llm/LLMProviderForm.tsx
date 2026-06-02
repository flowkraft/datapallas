"use client";

import { useState, useEffect, useRef, useMemo } from "react";
// lucide-react removed
import { Button } from "@/components/ui/button";
import {
  PROVIDER_CONFIGS,
  getProviderDef,
  type LLMFullConfig,
  type ProviderSettings,
  type ProviderDef,
} from "@/lib/llm-providers";
import { toast } from "sonner";

interface LLMProviderFormProps {
  fullConfig: LLMFullConfig;
  onSave: (fullConfig: LLMFullConfig) => Promise<void>;
}

interface FetchedModel {
  id: string;
  name: string;
}

export function LLMProviderForm({ fullConfig, onSave }: LLMProviderFormProps) {
  // Form state — initialized from the active provider's stored settings
  const activeSettings = fullConfig.providers[fullConfig.activeProviderId];
  const [providerId, setProviderId] = useState(fullConfig.activeProviderId);
  const [apiKey, setApiKey] = useState(activeSettings?.apiKey || "");
  const [model, setModel] = useState(activeSettings?.model || "");
  const [baseUrl, setBaseUrl] = useState(activeSettings?.baseUrl || "");

  // UI state
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Ollama pull state
  const [pullModelName, setPullModelName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [pullStatus, setPullStatus] = useState("");

  // Snapshot of fullConfig for dirty tracking
  const [savedFullConfig, setSavedFullConfig] = useState<LLMFullConfig>(fullConfig);

  const providerDef = getProviderDef(providerId);

  // Check if form is dirty by comparing against the saved config for the current provider
  const isProviderChanged = providerId !== savedFullConfig.activeProviderId;
  const isDirty = useMemo(() => {
    const savedSettings = savedFullConfig.providers[providerId];
    const savedApiKey = savedSettings?.apiKey || "";
    const savedModel = savedSettings?.model || "";
    const savedBaseUrl = savedSettings?.baseUrl || "";

    return (
      isProviderChanged ||
      apiKey !== savedApiKey ||
      model !== savedModel ||
      baseUrl !== savedBaseUrl
    );
  }, [providerId, apiKey, model, baseUrl, savedFullConfig, isProviderChanged]);

  // Sync with prop changes (e.g. when dialog reopens with fresh data)
  useEffect(() => {
    const settings = fullConfig.providers[fullConfig.activeProviderId];
    setProviderId(fullConfig.activeProviderId);
    setApiKey(settings?.apiKey || "");
    setModel(settings?.model || "");
    setBaseUrl(settings?.baseUrl || "");
    setSavedFullConfig(fullConfig);
    setFetchedModels([]);
    setModelSearch("");
  }, [fullConfig]);

  // When provider changes: load stored settings for that provider (if any)
  const handleProviderChange = (newProviderId: string) => {
    setProviderId(newProviderId);
    setFetchedModels([]);
    setModelSearch("");
    setShowModelDropdown(false);

    // Load stored settings for this provider
    const stored = savedFullConfig.providers[newProviderId];
    if (stored) {
      setApiKey(stored.apiKey || "");
      setModel(stored.model || "");
      setBaseUrl(stored.baseUrl || "");
    } else {
      // No stored config — use provider defaults
      setApiKey("");
      setModel("");
      const def = getProviderDef(newProviderId);
      if (def?.baseUrl !== undefined) {
        setBaseUrl(def.baseUrl);
      } else {
        setBaseUrl("");
      }
    }
  };

  // Fetch models from the server-side proxy
  const handleFetchModels = async () => {
    if (providerDef?.requiresApiKey !== false && !apiKey.trim()) {
      toast.error("Please enter your API key first");
      return;
    }

    setFetchingModels(true);
    try {
      const params = new URLSearchParams({ provider: providerId });
      if (apiKey.trim()) params.set("apiKey", apiKey);
      if (baseUrl.trim()) params.set("baseUrl", baseUrl);
      const res = await fetch(`/api/llm/models?${params.toString()}`);
      const data = await res.json();

      if (data.success && data.models?.length > 0) {
        setFetchedModels(data.models);
        toast.success(`Fetched ${data.models.length} models`);
      } else if (data.success && data.models?.length === 0) {
        toast.info("No models found for this API key");
        setFetchedModels([]);
      } else {
        toast.error(data.error || "Failed to fetch models");
        setFetchedModels([]);
      }
    } catch (error) {
      toast.error("Failed to fetch models — you can type the model ID manually");
      setFetchedModels([]);
    } finally {
      setFetchingModels(false);
    }
  };

  // Pull (download) a model from Ollama registry
  const handlePullModel = async () => {
    const name = pullModelName.trim();
    if (!name) {
      toast.error("Enter a model name to pull");
      return;
    }

    setPulling(true);
    setPullProgress(0);
    setPullStatus("Starting download...");

    try {
      const res = await fetch("/api/llm/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name, baseUrl: baseUrl.trim() || undefined }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || `Failed to pull model: ${res.statusText}`);
        setPulling(false);
        setPullStatus("");
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.status === "success") {
              setPullProgress(100);
              setPullStatus("Download complete!");
              toast.success(`Model "${name}" pulled successfully`);
              // Auto-refresh local models and select the pulled model
              setModel(name);
              setPullModelName("");
              await handleFetchModels();
            } else if (event.status === "error") {
              toast.error(event.message || "Pull failed");
              setPullStatus(`Error: ${event.message || "Unknown error"}`);
            } else if (event.status === "pulling") {
              setPullProgress(event.progress || 0);
              setPullStatus(event.detail || "Downloading...");
            }
          } catch {
            // skip malformed SSE
          }
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to connect to Ollama");
      setPullStatus("");
    } finally {
      setPulling(false);
    }
  };

  // Filter fetched models by search term
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return fetchedModels;
    const q = modelSearch.toLowerCase();
    return fetchedModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    );
  }, [fetchedModels, modelSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node) &&
        modelInputRef.current &&
        !modelInputRef.current.contains(e.target as Node)
      ) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Save handler — preserves other providers' stored configs
  const handleSave = async () => {
    setSaving(true);
    try {
      const currentSettings: ProviderSettings = {
        apiKey,
        model,
        baseUrl: providerDef?.showBaseUrl ? baseUrl : "",
      };

      const newFullConfig: LLMFullConfig = {
        activeProviderId: providerId,
        providers: {
          ...savedFullConfig.providers,
          [providerId]: currentSettings,
        },
      };

      await onSave(newFullConfig);
      setSavedFullConfig(newFullConfig);
      toast.success("API Provider settings saved");
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // Select a model from the dropdown
  const selectModel = (m: FetchedModel) => {
    setModel(m.id);
    setModelSearch("");
    setShowModelDropdown(false);
  };

  // Shared input class names
  const inputCls =
    "w-full rounded-md border border-base-300 bg-base-100 px-3 py-2 text-sm text-base-content placeholder:text-base-content/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";
  const labelCls =
    "block text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-1.5";

  // Render the provider <select> with optgroup
  const renderProviderSelect = () => {
    const natives = PROVIDER_CONFIGS.filter((p) => !p.group);
    const compatibles = PROVIDER_CONFIGS.filter((p) => p.group);

    return (
      <div>
        <label className={labelCls}>API Provider</label>
        <select
          value={providerId}
          onChange={(e) => handleProviderChange(e.target.value)}
          className={inputCls + " cursor-pointer"}
        >
          {natives.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <optgroup label="OpenAI Compatible">
            {compatibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        </select>

        {providerDef?.description && (
          <p className="text-xs text-base-content/60 mt-1.5 leading-relaxed">
            {providerDef.description}
          </p>
        )}
      </div>
    );
  };

  // Render Base URL field (conditionally)
  const renderBaseUrl = () => {
    if (!providerDef?.showBaseUrl) return null;

    return (
      <div>
        <label className={labelCls}>Base URL</label>
        <div className="relative">
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            readOnly={!providerDef.baseUrlEditable}
            placeholder="https://api.example.com/v1"
            className={`${inputCls} ${
              !providerDef.baseUrlEditable
                ? "bg-base-200 text-base-content/60 cursor-not-allowed pr-9"
                : ""
            }`}
          />
          {!providerDef.baseUrlEditable && (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/60"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
          )}
        </div>
      </div>
    );
  };

  // Render API Key field
  const renderApiKey = () => (
    <div>
      <label className={labelCls}>API Key</label>
      <div className="relative">
        <input
          type={showApiKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your API key"
          className={`${inputCls} pr-10`}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShowApiKey(!showApiKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-base-content/60 hover:text-base-content transition-colors"
          title={showApiKey ? "Hide API key" : "Show API key"}
        >
          {showApiKey ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
          )}
        </button>
      </div>
    </div>
  );

  // Render Ollama-specific section: warning, library link, pull UI
  const renderOllamaSection = () => {
    if (providerId !== "ollama") return null;

    return (
      <>
        {/* Warning banner */}
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3">
          <div className="flex gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium mb-1">Local LLM Hardware Requirements</p>
              <p className="text-xs leading-relaxed">
                Running a capable local LLM to power useful AI agents requires a machine with
                hundreds of GBs of RAM — which you probably don&apos;t have!
                Smaller models will produce poor or completely unusable results.
                Are you sure you know what you are doing?
              </p>
              <p className="text-xs leading-relaxed mt-1.5">
                We suggest models like <strong>glm-5</strong>, <strong>minimax-m2.5</strong>, or <strong>kimi-k2.5</strong>.
              </p>
              <a
                href="https://ollama.com/library?sort=newest"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline"
              >
                Browse available models at ollama.com/library
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              </a>
            </div>
          </div>
        </div>

        {/* Pull model section */}
        <div>
          <label className={labelCls}>Pull a New Model</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={pullModelName}
              onChange={(e) => setPullModelName(e.target.value)}
              placeholder="e.g. llama3:latest"
              className={inputCls}
              disabled={pulling}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !pulling && pullModelName.trim()) {
                  e.preventDefault();
                  handlePullModel();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePullModel}
              disabled={pulling || !pullModelName.trim()}
              className="shrink-0 h-[38px] px-3"
              title="Download model from Ollama registry"
            >
              {pulling ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              )}
              <span className="ml-1.5">{pulling ? "Pulling..." : "Pull"}</span>
            </Button>
          </div>

          {/* Progress bar */}
          {(pulling || pullStatus) && (
            <div className="mt-2">
              <div className="w-full h-2 bg-base-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${pullProgress}%` }}
                />
              </div>
              <p className="text-xs text-base-content/60 mt-1 truncate">
                {pullStatus}
                {pulling && pullProgress > 0 && ` (${pullProgress}%)`}
              </p>
            </div>
          )}
        </div>
      </>
    );
  };

  // Render Model field — either searchable lookup or free text
  const renderModelField = () => {
    if (providerDef?.modelInputType === "text") {
      // Free text input for "Other"
      return (
        <div>
          <label className={labelCls}>Model ID</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. llama3.1:70b"
            className={inputCls}
          />
        </div>
      );
    }

    // Searchable lookup for all other providers
    return (
      <div>
        <label className={labelCls}>
          {providerId === "ollama" ? "Select Model (already downloaded)" : "Model"}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={modelInputRef}
              type="text"
              value={showModelDropdown ? modelSearch : model}
              onChange={(e) => {
                setModelSearch(e.target.value);
                if (!showModelDropdown && fetchedModels.length > 0) {
                  setShowModelDropdown(true);
                }
              }}
              onFocus={() => {
                if (fetchedModels.length > 0) {
                  setShowModelDropdown(true);
                  setModelSearch("");
                }
              }}
              placeholder={
                fetchedModels.length > 0
                  ? "Search models..."
                  : "Click 'Fetch Models' or type model ID"
              }
              className={`${inputCls} ${
                fetchedModels.length > 0 ? "pr-8" : ""
              }`}
            />
            {fetchedModels.length > 0 && (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/60 pointer-events-none"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            )}

            {/* Dropdown list */}
            {showModelDropdown && fetchedModels.length > 0 && (
              <div
                ref={modelDropdownRef}
                className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-base-300 bg-base-100 shadow-lg"
              >
                {filteredModels.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-base-content/60">
                    No models match &quot;{modelSearch}&quot;
                  </div>
                ) : (
                  filteredModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => selectModel(m)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-base-200 transition-colors ${
                        m.id === model
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-base-content"
                      }`}
                    >
                      <div className="truncate">
                        {m.name !== m.id ? (
                          <>
                            <span>{m.name}</span>
                            <span className="text-base-content/60 ml-2 text-xs">
                              {m.id}
                            </span>
                          </>
                        ) : (
                          <span>{m.id}</span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Fetch Models button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFetchModels}
            disabled={fetchingModels || (providerDef?.requiresApiKey !== false && !apiKey.trim())}
            className="shrink-0 h-[38px] px-3"
            title={
              providerDef?.requiresApiKey !== false && !apiKey.trim()
                ? "Enter API key first"
                : "Fetch available models from provider"
            }
          >
            {fetchingModels ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            )}
            <span className="ml-1.5 hidden sm:inline">
              {fetchingModels ? "Fetching..." : "Fetch Models"}
            </span>
          </Button>
        </div>

        {/* Show selected model below when dropdown is open */}
        {model && showModelDropdown && (
          <p className="text-xs text-base-content/60 mt-1">
            Selected: <span className="font-medium text-base-content">{model}</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderProviderSelect()}

      {/* Provider-change restart note */}
      {isProviderChanged && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2">
          <div className="flex gap-2 items-start">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Switching providers requires a restart to apply new API keys.
              After saving, stop and start your FlowKraft&apos;s AI Hub application again before provisioning agents.
            </p>
          </div>
        </div>
      )}

      {renderBaseUrl()}
      {providerDef?.requiresApiKey !== false && renderApiKey()}
      {renderOllamaSection()}
      {renderModelField()}

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="bg-primary hover:bg-primary/90 text-primary-content disabled:opacity-50"
        >
          {saving ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 mr-2 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}
