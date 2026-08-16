// Ember Terminal page: split-station API workbench where orange signals actions, mono labels expose diagnostics, and media remains the visual focus.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Clipboard,
  Code2,
  CreditCard,
  FileText,
  ImageIcon,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Menu,
  MessageCircle,
  Mic2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  UserRound,
  Video,
  VideoIcon,
  Volume2,
  Webhook,
  X,
} from "lucide-react";
import { toast } from "sonner";

const API_BASE = "https://api.oh.xyz";
const KEY_STORAGE = "oh-api-playground-api-key";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

type Character = {
  character_id: string;
  name: string;
  age?: string | number;
  occupation?: string;
  profile_image_url?: string;
  type?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "character";
  content: string;
};

type ApiProblem = Error & {
  status?: number;
  details?: unknown;
};

type GenerationResult = {
  status: string;
  url?: string;
  jobId?: string;
};

type AppTab = "Chat" | "Image" | "Video" | "Audio" | "Cam";

const tabs: { name: AppTab; icon: typeof MessageCircle; endpoint: string }[] = [
  { name: "Chat", icon: MessageCircle, endpoint: "POST /api/v1/text" },
  { name: "Image", icon: ImageIcon, endpoint: "POST /api/v1/images" },
  { name: "Video", icon: Video, endpoint: "POST /api/v1/videos/create" },
  { name: "Audio", icon: AudioLines, endpoint: "POST /api/v1/audio/notes" },
  { name: "Cam", icon: VideoIcon, endpoint: "POST /api/v1/cam/create" },
];

const navSections = [
  {
    title: "Workspace",
    items: [
      { name: "Dashboard", icon: LayoutDashboard },
      { name: "APIs", icon: Code2 },
      { name: "Documentation", icon: FileText },
      { name: "Playground", icon: Sparkles, current: true },
    ],
  },
  {
    title: "Manage",
    items: [
      { name: "Characters", icon: UserRound },
      { name: "Usage Analytics", icon: Activity },
      { name: "Pricing", icon: CreditCard },
      { name: "Payments", icon: CreditCard },
    ],
  },
  {
    title: "Support",
    items: [
      { name: "Account", icon: Settings },
      { name: "Contact", icon: MessageCircle },
    ],
  },
];

function extractErrorMessage(body: unknown, fallback: string) {
  if (typeof body === "string" && body.trim()) return body;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const primary = record.error ?? record.message ?? record.detail ?? record.title;
    if (typeof primary === "string" && primary.trim()) return primary;
  }
  return fallback;
}

function stringifyBody(body: unknown) {
  if (typeof body === "string") return body;
  if (body === undefined || body === null) return "No additional response body was returned.";
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

function getResultUrl(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const object = payload as Record<string, unknown>;
  const candidates = [
    object.presigned_url,
    object.url,
    object.media_url,
    object.result_url,
    object.output_url,
    (object.data as Record<string, unknown> | undefined)?.presigned_url,
    (object.data as Record<string, unknown> | undefined)?.url,
    (object.result as Record<string, unknown> | undefined)?.presigned_url,
    (object.result as Record<string, unknown> | undefined)?.url,
  ];
  return candidates.find((value): value is string => typeof value === "string" && value.length > 0);
}

function getJobId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const object = payload as Record<string, unknown>;
  const candidates = [
    object.job_id,
    object.jobId,
    (object.data as Record<string, unknown> | undefined)?.job_id,
    (object.data as Record<string, unknown> | undefined)?.jobId,
  ];
  return candidates.find((value): value is string => typeof value === "string" && value.length > 0);
}

function getRoomId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const object = payload as Record<string, unknown>;
  const room = object.room as Record<string, unknown> | undefined;
  const candidates = [object.room_id, object.roomId, object.id, room?.room_id, room?.roomId, room?.id];
  return candidates.find((value): value is string => typeof value === "string" && value.length > 0);
}

function getTextReply(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return undefined;
  const object = payload as Record<string, unknown>;
  const data = object.data as Record<string, unknown> | undefined;
  const response = object.response as Record<string, unknown> | undefined;
  const candidates = [object.reply, object.text, object.message, object.content, data?.reply, data?.text, data?.message, data?.content, response?.text, response?.content];
  return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function normalizeCharacters(payload: unknown): Character[] {
  const root = payload as Record<string, unknown> | Character[];
  const candidates = Array.isArray(root)
    ? root
    : [root?.characters, root?.data, (root?.data as Record<string, unknown> | undefined)?.characters, root?.results].find(Array.isArray) ?? [];
  return (candidates as Record<string, unknown>[])
    .map((entry) => ({
      character_id: String(entry.character_id ?? entry.characterId ?? entry.id ?? ""),
      // customer-character listings answer firstName/lastName rather than a
      // single name field (verified live, 16 Aug 2026).
      name: String(
        entry.name
          ?? entry.character_name
          ?? [entry.firstName, entry.lastName].filter(Boolean).join(" ")
          ?? "Unnamed character",
      ) || "Unnamed character",
      age: entry.age as string | number | undefined,
      occupation: (entry.occupation ?? entry.job ?? entry.profession) as string | undefined,
      profile_image_url: (entry.profile_image_url ?? entry.profileImageUrl ?? entry.image_url ?? entry.avatar_url ?? entry.sfwImage) as string | undefined,
      type: (entry.type ?? entry.character_type) as string | undefined,
    }))
    .filter((character) => Boolean(character.character_id));
}

/**
 * POST /rooms requires a user_id (verified live — the documented body without
 * it answers 400). The playground has no accounts, so a stable per-browser
 * identifier stands in for one.
 */
function playgroundUserId() {
  const KEY = "oh-api-playground-user-id";
  let stored = window.localStorage.getItem(KEY);
  if (!stored) {
    stored = `playground-${crypto.randomUUID()}`;
    window.localStorage.setItem(KEY, stored);
  }
  return stored;
}

function statusTone(status: string) {
  if (["completed", "succeeded", "success", "ready"].includes(status.toLowerCase())) return "text-[#86d7a0]";
  if (["failed", "error", "cancelled"].includes(status.toLowerCase())) return "text-[#ff909b]";
  return "text-[#ffba7d]";
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [activeTab, setActiveTab] = useState<AppTab>("Chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [characterError, setCharacterError] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomLoading, setRoomLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [audioText, setAudioText] = useState("");
  const [videoMode, setVideoMode] = useState<"text" | "image">("text");
  const [imageUrl, setImageUrl] = useState("");
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [camLoading, setCamLoading] = useState(false);
  const [camResult, setCamResult] = useState<Record<string, unknown> | null>(null);
  const [camError, setCamError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.character_id === selectedCharacterId),
    [characters, selectedCharacterId],
  );

  useEffect(() => {
    const storedKey = window.localStorage.getItem(KEY_STORAGE);
    if (storedKey) setApiKey(storedKey);
  }, []);

  useEffect(() => {
    if (apiKey.trim()) window.localStorage.setItem(KEY_STORAGE, apiKey.trim());
    else window.localStorage.removeItem(KEY_STORAGE);
  }, [apiKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, sendingChat]);

  async function request(path: string, init: RequestInit = {}) {
    const key = apiKey.trim();
    if (!key) {
      const problem = new Error("An API key is required before this request can be sent.") as ApiProblem;
      problem.status = 401;
      throw problem;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          "X-API-Key": key,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (cause) {
      const problem = new Error("The request could not reach the Oh API. Check your connection or browser CORS permissions.") as ApiProblem;
      problem.details = cause instanceof Error ? cause.message : cause;
      throw problem;
    }

    const raw = await response.text();
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }

    if (!response.ok) {
      const problem = new Error(extractErrorMessage(body, `Request failed with HTTP ${response.status}.`)) as ApiProblem;
      problem.status = response.status;
      problem.details = body;
      throw problem;
    }
    return body;
  }

  function showProblem(problem: unknown, heading: string) {
    const known = problem as ApiProblem;
    const message = known?.message || "An unexpected response was received.";
    const body = known?.details ? stringifyBody(known.details) : "";
    toast.error(heading, { description: body ? `${message} — ${body.slice(0, 180)}` : message });
    return body ? `${message}\n\nResponse body:\n${body}` : message;
  }

  async function loadCharacters() {
    setCharactersLoading(true);
    setCharacterError("");
    try {
      // GET /api/v1/characters does not exist on the live service (verified
      // 16 Aug 2026); the customer listing is what the key can actually see.
      const body = await request("/api/v1/characters/customer-characters");
      const nextCharacters = normalizeCharacters(body);
      setCharacters(nextCharacters);
      if (!nextCharacters.length) {
        setCharacterError("The API returned successfully, but no selectable characters were found in the response.");
      } else {
        setSelectedCharacterId((current) => current || nextCharacters[0].character_id);
        toast.success("Character library loaded", { description: `${nextCharacters.length} character${nextCharacters.length === 1 ? "" : "s"} ready to test.` });
      }
    } catch (problem) {
      setCharacterError(showProblem(problem, "Could not load characters"));
    } finally {
      setCharactersLoading(false);
    }
  }

  async function createRoom(characterId: string) {
    setRoomLoading(true);
    try {
      const body = await request("/api/v1/rooms", { method: "POST", body: JSON.stringify({ character_id: characterId, user_id: playgroundUserId() }) });
      const nextRoomId = getRoomId(body);
      if (!nextRoomId) {
        const problem = new Error("The room was created, but the response did not contain a room_id.") as ApiProblem;
        problem.details = body;
        throw problem;
      }
      setRoomId(nextRoomId);
      return nextRoomId;
    } catch (problem) {
      showProblem(problem, "Could not create chat room");
      return undefined;
    } finally {
      setRoomLoading(false);
    }
  }

  async function selectCharacter(characterId: string) {
    setSelectedCharacterId(characterId);
    setMessages([]);
    setRoomId("");
    setGeneration(null);
    setCamResult(null);
    if (activeTab === "Chat" && apiKey.trim()) await createRoom(characterId);
  }

  async function sendChat() {
    const message = messageInput.trim();
    if (!message || !selectedCharacter) return;
    setSendingChat(true);
    const localId = `${Date.now()}-user`;
    setMessages((current) => [...current, { id: localId, role: "user", content: message }]);
    setMessageInput("");
    try {
      const activeRoom = roomId || (await createRoom(selectedCharacter.character_id));
      if (!activeRoom) throw new Error("A valid room ID is required before a message can be sent.");
      const body = await request("/api/v1/text", {
        method: "POST",
        body: JSON.stringify({ room_id: activeRoom, character_id: selectedCharacter.character_id, message }),
      });
      const reply = getTextReply(body);
      if (!reply) {
        const problem = new Error("The text endpoint returned successfully, but no character reply was found.") as ApiProblem;
        problem.details = body;
        throw problem;
      }
      setMessages((current) => [...current, { id: `${Date.now()}-character`, role: "character", content: reply }]);
    } catch (problem) {
      setMessages((current) => current.filter((entry) => entry.id !== localId));
      showProblem(problem, "Message not sent");
    } finally {
      setSendingChat(false);
    }
  }

  async function pollJob(jobId: string, initialUrl?: string) {
    const started = Date.now();
    let lastStatus = "queued";
    while (Date.now() - started < POLL_TIMEOUT_MS) {
      const body = await request(`/api/v1/jobs/${encodeURIComponent(jobId)}/status`);
      const record = (body ?? {}) as Record<string, unknown>;
      lastStatus = String(record.status ?? (record.data as Record<string, unknown> | undefined)?.status ?? "processing").toLowerCase();
      const url = getResultUrl(body) ?? initialUrl;
      setGeneration({ status: lastStatus, jobId, url });
      if (["completed", "succeeded", "success", "ready"].includes(lastStatus)) return { status: lastStatus, jobId, url };
      if (["failed", "error", "cancelled"].includes(lastStatus)) {
        const problem = new Error(extractErrorMessage(body, `The generation job ${lastStatus}.`)) as ApiProblem;
        problem.details = body;
        throw problem;
      }
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    }
    const problem = new Error("Polling stopped after five minutes without a completed result.") as ApiProblem;
    problem.details = { job_id: jobId, last_status: lastStatus };
    throw problem;
  }

  async function runGeneration(kind: "image" | "video" | "audio") {
    if (!selectedCharacter) {
      toast.error("Select a character first", { description: "The generation request needs a character ID." });
      return;
    }
    const input = kind === "audio" ? audioText.trim() : prompt.trim();
    if (!input) {
      toast.error(kind === "audio" ? "Enter text for the audio note" : "Describe the result you want", { description: "The request prompt cannot be empty." });
      return;
    }
    if (kind === "video" && videoMode === "image" && !imageUrl.trim()) {
      toast.error("Add an image URL", { description: "Image-to-video requests need a public source image URL." });
      return;
    }
    setGenerating(true);
    setGeneration(null);
    setGenerationError("");
    // Audio is the one synchronous route and it lives at /audio/notes with
    // the text in `prompt` (plus room context); /api/v1/audio answers 403
    // "Unknown endpoint" on the live service. A bare url in the response is
    // already a finished result — the job_id branch below handles that.
    const endpoint = kind === "image" ? "/api/v1/images" : kind === "video" ? "/api/v1/videos/create" : "/api/v1/audio/notes";
    const payload = kind === "image"
      ? { character_id: selectedCharacter.character_id, prompt: input, prompt_enhancement: false, resolution: "9:16" }
      : kind === "video"
        ? videoMode === "image"
          ? { image_url: imageUrl.trim(), prompt: input }
          : { character_id: selectedCharacter.character_id, prompt: input }
        : { character_id: selectedCharacter.character_id, ...(roomId ? { room_id: roomId } : {}), prompt: input, text: input };

    try {
      const body = await request(endpoint, { method: "POST", body: JSON.stringify(payload) });
      const jobId = getJobId(body);
      const url = getResultUrl(body);
      if (!jobId) {
        if (url) {
          setGeneration({ status: "completed", url });
          return;
        }
        const problem = new Error("The generation request did not return a job_id or result URL.") as ApiProblem;
        problem.details = body;
        throw problem;
      }
      setGeneration({ status: "queued", jobId, url });
      await pollJob(jobId, url);
    } catch (problem) {
      setGenerationError(showProblem(problem, `${kind[0].toUpperCase()}${kind.slice(1)} generation failed`));
    } finally {
      setGenerating(false);
    }
  }

  async function createCamSession() {
    if (!selectedCharacter) {
      toast.error("Select a character first", { description: "A Cam session must be attached to a character." });
      return;
    }
    if (!webhookUrl.trim()) {
      toast.error("Enter a webhook URL", { description: "Cam needs a URL where it can deliver session events." });
      return;
    }
    setCamLoading(true);
    setCamResult(null);
    setCamError("");
    try {
      const body = await request("/api/v1/cam/create", {
        method: "POST",
        body: JSON.stringify({ characterId: selectedCharacter.character_id, restEndpointUrl: webhookUrl.trim(), apiKey: apiKey.trim() }),
      });
      if (!body || typeof body !== "object") {
        const problem = new Error("The Cam endpoint returned an unexpected response.") as ApiProblem;
        problem.details = body;
        throw problem;
      }
      setCamResult(body as Record<string, unknown>);
      toast.success("Cam session created", { description: "Session details are ready to copy." });
    } catch (problem) {
      setCamError(showProblem(problem, "Could not create Cam session"));
    } finally {
      setCamLoading(false);
    }
  }

  function copyValue(label: string, value: unknown) {
    navigator.clipboard.writeText(typeof value === "string" ? value : JSON.stringify(value, null, 2)).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy unavailable", { description: "Select and copy the value manually." }),
    );
  }

  function handleTabChange(next: AppTab) {
    setActiveTab(next);
    setGeneration(null);
    setGenerationError("");
    setCamResult(null);
    setCamError("");
    if (next === "Chat" && selectedCharacter && !roomId && apiKey.trim()) void createRoom(selectedCharacter.character_id);
  }

  const requestState = charactersLoading || roomLoading || sendingChat || generating || camLoading;
  const activeEndpoint = tabs.find((tab) => tab.name === activeTab)?.endpoint ?? "";

  return (
    <div className="min-h-screen bg-[#0f0a10] text-[#f5edf4]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[274px] flex-col border-r border-[#e8c8ed]/10 bg-[#1a0d1c] shadow-[18px_0_46px_rgba(0,0,0,0.18)] transition-transform duration-200 lg:!translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[76px] items-center justify-between border-b border-[#e8c8ed]/10 px-6">
          <div className="flex items-center gap-3">
            <img className="h-10 w-10" src="/manus-storage/oh-api-aperture-logo_f3aa7ca4.png" alt="Oh API Playground" />
            <div>
              <div className="text-base font-bold tracking-[-0.04em] text-white">oh <span className="text-[#fc7a1d]">/</span></div>
              <div className="micro-label mt-0.5 text-[#aa8cac]">API playground</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="pressable rounded-md p-1.5 text-[#bba1be] hover:bg-white/5 hover:text-white lg:hidden" aria-label="Close navigation"><X size={18} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6">
          {navSections.map((section) => (
            <div className="mb-7" key={section.title}>
              <div className="micro-label mb-2 px-3 text-[#7e627f]">{section.title}</div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.name}
                      onClick={() => !item.current && toast("Feature coming soon", { description: `${item.name} is shown for navigation continuity; the interactive playground is ready now.` })}
                      className={`pressable group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${item.current ? "bg-[#fc7a1d]/12 text-[#ffd5b8] shadow-[inset_2px_0_0_#fc7a1d]" : "text-[#bda8be] hover:bg-white/[0.045] hover:text-white"}`}
                    >
                      <Icon size={17} strokeWidth={item.current ? 2.3 : 1.8} className={item.current ? "text-[#fc7a1d]" : "text-[#9c82a0] group-hover:text-[#d8c2dc]"} />
                      <span>{item.name}</span>
                      {item.current && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#fc7a1d]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="m-4 rounded-xl border border-[#ad74b5]/15 bg-[#110113] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#eddfef]"><CircleDashed size={15} className="text-[#913cdd]" /> Direct browser mode</div>
          <p className="mt-2 text-xs leading-5 text-[#9e879f]">Your API key stays in this browser’s local storage and is sent directly to the Oh API.</p>
        </div>
      </aside>

      {sidebarOpen && <button onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/60 lg:hidden" aria-label="Close navigation overlay" />}

      <main className="min-h-screen lg:pl-[274px]">
        <header className="relative overflow-hidden border-b border-[#e8c8ed]/10 bg-[#130715]">
          <div className="absolute inset-0 opacity-45" style={{ backgroundImage: "url(/manus-storage/oh-api-signal-mesh_5c21ffe4.png)", backgroundSize: "cover", backgroundPosition: "right center" }} />
          <div className="relative flex min-h-[86px] items-center justify-between gap-4 px-4 sm:px-7">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="pressable rounded-lg border border-[#e8c8ed]/10 bg-[#1a0d1c]/90 p-2 text-[#d6bed8] hover:border-[#fc7a1d]/50 hover:text-white lg:hidden" aria-label="Open navigation"><Menu size={19} /></button>
              <div className="hidden items-center gap-2.5 border-r border-[#e8c8ed]/10 pr-5 lg:flex">
                <img className="h-11 w-11" src="/manus-storage/oh-api-aperture-logo_f3aa7ca4.png" alt="Oh API Playground" />
                <div>
                  <div className="text-xl font-bold tracking-[-0.06em] text-white">oh <span className="text-[#fc7a1d]">/</span></div>
                  <div className="micro-label mt-0.5 text-[#9f7fa2]">Browser console</div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2"><span className="micro-label text-[#aa8cac]">Workspace</span><ChevronRight size={13} className="text-[#715473]" /><span className="micro-label text-[#f1d7f4]">Playground</span></div>
                <h1 className="mt-1 text-[1.35rem] font-bold tracking-[-0.055em] text-white sm:text-[1.65rem]">Test the Oh API in real time.</h1>
              </div>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <div className="flex items-center gap-2 rounded-full border border-[#e8c8ed]/10 bg-[#110113]/85 px-3 py-1.5 text-xs text-[#bfa9c2]"><span className={`h-1.5 w-1.5 rounded-full ${requestState ? "running-dot bg-[#fc7a1d]" : "bg-[#7fbb92]"}`} />{requestState ? "Request active" : "Console ready"}</div>
              <a href="https://api.oh.xyz/documentation" target="_blank" rel="noreferrer" className="pressable flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-[#d3b9d6] hover:bg-white/5 hover:text-white">Docs <ArrowUpRight size={15} /></a>
            </div>
          </div>
        </header>

        <div className="subtle-grid min-h-[calc(100vh-86px)] px-4 py-5 sm:px-7 sm:py-7">
          <section className="mb-5 grid overflow-hidden rounded-xl border border-[#ead0ee]/10 bg-[#120914]/90 text-xs shadow-[0_14px_36px_rgba(0,0,0,0.14)] md:grid-cols-3">
            <StationReadout index="01" label="Credential station" value={apiKey.trim() ? "KEY CACHED · LOCAL" : "KEY REQUIRED"} state={apiKey.trim() ? "ready" : "idle"} />
            <StationReadout index="02" label="Character station" value={characters.length ? `${characters.length} PROFILES LOADED` : "LIBRARY STAGED"} state={characters.length ? "ready" : "idle"} />
            <StationReadout index="03" label="Request station" value={activeEndpoint.replace("/api/v1/", "").toUpperCase()} state={requestState ? "active" : "ready"} />
          </section>
          <section className="workbench-card fade-up overflow-hidden rounded-2xl">
            <div className="flex flex-col gap-5 border-b border-[#ead0ee]/10 p-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2"><span className="signal-dot" /><span className="micro-label text-[#fc7a1d]">Authentication station</span></div>
                <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#fff6ff]">Paste a key to unlock the workbench.</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-[#aa91ad]">Stored locally on this device. Every request sends it as an <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-[#e5cce7]">X-API-Key</code> header.</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#a88daa]"><span className="flex items-center gap-2"><LockKeyhole size={14} className="text-[#913cdd]" /> Browser-only credential storage</span><span className="hidden items-center gap-2 font-mono text-[10px] text-[#f1b685] sm:flex"><span className="h-px w-5 bg-[#fc7a1d]" /> X-API-Key / DIRECT</span></div>
            </div>
            <div className="grid gap-3 p-5 lg:grid-cols-[1fr_auto]">
              <label className="relative block">
                <span className="micro-label mb-2 block text-[#997a9b]">Your API key</span>
                <KeyRound size={17} className="absolute bottom-3.5 left-4 text-[#9e77a3]" />
                <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your Oh API key" className="h-11 w-full rounded-xl border border-[#e7c9ea]/10 bg-[#09070a]/70 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-[#665267] focus:border-[#913cdd] focus:ring-2 focus:ring-[#913cdd]/15" />
              </label>
              <button onClick={loadCharacters} disabled={charactersLoading || !apiKey.trim()} className="pressable mt-auto flex h-11 items-center justify-center gap-2 rounded-xl bg-[#fc7a1d] px-5 text-sm font-bold text-[#271108] shadow-[0_9px_22px_rgba(252,122,29,0.2)] hover:bg-[#ff8a37] disabled:cursor-not-allowed disabled:opacity-45">
                {charactersLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Load characters
              </button>
            </div>
          </section>

          <section className="mt-5 overflow-hidden rounded-2xl border border-[#ead0ee]/10 bg-[#110113]/88 shadow-[0_20px_50px_rgba(0,0,0,0.16)]">
            <div className="flex overflow-x-auto border-b border-[#ead0ee]/10 px-2 pt-2 sm:px-4">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = tab.name === activeTab;
                return (
                  <button key={tab.name} onClick={() => handleTabChange(tab.name)} className={`pressable relative flex shrink-0 items-center gap-2 px-4 py-3.5 text-sm font-semibold ${active ? "text-[#ffd3b2]" : "text-[#9a839c] hover:text-[#d8c3da]"}`}>
                    <Icon size={16} className={active ? "text-[#fc7a1d]" : ""} /> {tab.name}
                    {active && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#fc7a1d]" />}
                  </button>
                );
              })}
              <div className="ml-auto hidden shrink-0 items-center gap-2 py-3 pr-3 sm:flex"><span className="micro-label text-[#826985]">Live route</span><code className="rounded bg-[#2b1430] px-2 py-1 font-mono text-[10px] text-[#c3a9c7]">{activeEndpoint}</code></div>
            </div>

            <div className="p-4 sm:p-5">
              {activeTab === "Chat" && (
                <div className="grid min-h-[570px] gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
                  <CharacterLibrary characters={characters} selectedCharacterId={selectedCharacterId} loading={charactersLoading} error={characterError} onLoad={loadCharacters} onSelect={selectCharacter} />
                  <ChatDesk selectedCharacter={selectedCharacter} messages={messages} messageInput={messageInput} roomId={roomId} loading={sendingChat || roomLoading} onInput={setMessageInput} onSend={sendChat} messagesEndRef={messagesEndRef} />
                </div>
              )}

              {activeTab === "Image" && (
                <MediaStation title="Generate an image" description="Select a character, give the render a specific visual direction, then watch its async job state." selectedCharacter={selectedCharacter} characters={characters} selectedCharacterId={selectedCharacterId} onSelect={selectCharacter} onLoad={loadCharacters} loadingCharacters={charactersLoading} characterError={characterError}>
                  <PromptField label="Image prompt" value={prompt} onChange={setPrompt} placeholder="Describe the scene, composition, lighting, and mood…" rows={4} />
                  <ActionButton pending={generating} label="Generate image" icon={ImageIcon} onClick={() => runGeneration("image")} />
                  <GenerationOutput kind="image" result={generation} pending={generating} error={generationError} />
                </MediaStation>
              )}

              {activeTab === "Video" && (
                <MediaStation title="Generate a video" description="Send either a character-driven text prompt or an existing image URL to the asynchronous video route." selectedCharacter={selectedCharacter} characters={characters} selectedCharacterId={selectedCharacterId} onSelect={selectCharacter} onLoad={loadCharacters} loadingCharacters={charactersLoading} characterError={characterError}>
                  <div className="flex rounded-xl border border-[#e8c8ed]/10 bg-[#0a070b] p-1">
                    {(["text", "image"] as const).map((mode) => <button key={mode} onClick={() => setVideoMode(mode)} className={`pressable flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${videoMode === mode ? "bg-[#2a1430] text-[#ffd4b5] shadow-sm" : "text-[#8d758f] hover:text-white"}`}>{mode === "text" ? "Text to Video" : "Image to Video"}</button>)}
                  </div>
                  {videoMode === "image" && <SingleField label="Source image URL" value={imageUrl} onChange={setImageUrl} placeholder="https://…/source-image.png" />}
                  <PromptField label="Video prompt" value={prompt} onChange={setPrompt} placeholder={videoMode === "text" ? "Describe the action, camera movement, and mood…" : "Describe the motion you want from the source image…"} rows={4} />
                  <ActionButton pending={generating} label="Generate video" icon={Video} onClick={() => runGeneration("video")} />
                  <GenerationOutput kind="video" result={generation} pending={generating} error={generationError} />
                </MediaStation>
              )}

              {activeTab === "Audio" && (
                <MediaStation title="Generate an audio note" description="Choose a voice-ready character, write the line, and receive the completed audio URL when the job resolves." selectedCharacter={selectedCharacter} characters={characters} selectedCharacterId={selectedCharacterId} onSelect={selectCharacter} onLoad={loadCharacters} loadingCharacters={charactersLoading} characterError={characterError}>
                  <PromptField label="What should the character say?" value={audioText} onChange={setAudioText} placeholder="Write the exact spoken line…" rows={5} />
                  <ActionButton pending={generating} label="Generate audio" icon={Volume2} onClick={() => runGeneration("audio")} />
                  <GenerationOutput kind="audio" result={generation} pending={generating} error={generationError} />
                </MediaStation>
              )}

              {activeTab === "Cam" && (
                <CamStation selectedCharacter={selectedCharacter} characters={characters} selectedCharacterId={selectedCharacterId} webhookUrl={webhookUrl} result={camResult} loading={camLoading} error={camError} onSelect={selectCharacter} onLoad={loadCharacters} onWebhook={setWebhookUrl} onCreate={createCamSession} loadingCharacters={charactersLoading} characterError={characterError} onCopy={copyValue} />
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function StationReadout({ index, label, value, state }: { index: string; label: string; value: string; state: "idle" | "ready" | "active" }) {
  const signalClass = state === "idle" ? "bg-[#765779]" : state === "active" ? "running-dot bg-[#fc7a1d]" : "bg-[#86d7a0]";
  return <div className="relative flex min-w-0 items-center gap-3 border-b border-[#ead0ee]/10 px-4 py-3.5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><span className="absolute bottom-0 left-0 top-0 w-0.5 bg-[#fc7a1d] opacity-0 transition-opacity duration-200" style={{ opacity: state === "active" ? 1 : 0.22 }} /><span className="font-mono text-[10px] text-[#7f6282]">{index}</span><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${signalClass}`} /><span className="min-w-0"><span className="micro-label block text-[9px] text-[#8d7190]">{label}</span><span className="mt-1 block truncate font-mono text-[11px] font-medium tracking-wide text-[#dfcae1]">{value}</span></span></div>;
}

function CharacterLibrary({ characters, selectedCharacterId, loading, error, onLoad, onSelect }: { characters: Character[]; selectedCharacterId: string; loading: boolean; error: string; onLoad: () => void; onSelect: (id: string) => void }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#e8c8ed]/10 bg-[#0c080d]">
      <div className="flex items-center justify-between border-b border-[#e8c8ed]/10 px-4 py-3.5"><div><div className="micro-label text-[#927794]">Source</div><h3 className="mt-1 font-semibold text-white">Character library</h3></div><button onClick={onLoad} className="pressable rounded-lg p-2 text-[#ba9abd] hover:bg-white/5 hover:text-[#fc7a1d]" aria-label="Reload character library"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button></div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {loading && <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-sm text-[#9d859f]"><Loader2 className="animate-spin text-[#fc7a1d]" /><span>Loading library…</span></div>}
        {!loading && error && <LibraryError error={error} />}
        {!loading && !error && !characters.length && <EmptyLibrary onLoad={onLoad} />}
        {!loading && characters.map((character) => <CharacterCard key={character.character_id} character={character} active={character.character_id === selectedCharacterId} onClick={() => onSelect(character.character_id)} />)}
      </div>
    </section>
  );
}

function CharacterCard({ character, active, onClick }: { character: Character; active: boolean; onClick: () => void }) {
  const digitalTwin = character.type?.toUpperCase().replaceAll("_", " ") === "DIGITAL TWIN";
  return <button onClick={onClick} className={`pressable relative flex w-full items-center gap-3 overflow-hidden rounded-xl border p-2.5 text-left ${active ? "border-[#fc7a1d]/50 bg-[#fc7a1d]/10" : "border-transparent bg-white/[0.025] hover:border-[#b885be]/25 hover:bg-white/[0.055]"}`}>
    {active && <span className="absolute bottom-0 left-0 top-0 w-0.5 bg-[#fc7a1d]" />}
    <Avatar character={character} size="h-11 w-11" />
    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold text-[#faedfb]">{character.name}</span>{character.age !== undefined && <span className="text-xs text-[#987e9a]">{character.age}</span>}</span><span className="mt-1 block truncate text-xs text-[#a88eaa]">{character.occupation || "Character profile"}</span><span className={`micro-label mt-1.5 inline-flex rounded px-1.5 py-1 text-[8px] ${digitalTwin ? "bg-[#913cdd]/20 text-[#c99cf6]" : "bg-[#fc7a1d]/15 text-[#ffba87]"}`}>{digitalTwin ? "Digital twin" : "Original"}</span></span>
  </button>;
}

function Avatar({ character, size = "h-12 w-12" }: { character: Character; size?: string }) {
  return character.profile_image_url ? <img src={character.profile_image_url} alt="" className={`${size} shrink-0 rounded-lg object-cover ring-1 ring-white/10`} /> : <span className={`flex ${size} shrink-0 items-center justify-center rounded-lg bg-[#2d1730] text-sm font-bold text-[#d6a4dc]`}>{character.name.slice(0, 1).toUpperCase()}</span>;
}

function EmptyLibrary({ onLoad }: { onLoad: () => void }) {
  return <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center"><Bot size={24} className="text-[#913cdd]" /><p className="mt-3 text-sm font-medium text-[#e3cce5]">No library loaded</p><p className="mt-1 text-xs leading-5 text-[#947d96]">Add your key above, then load the characters available to that credential.</p><button onClick={onLoad} className="pressable mt-4 rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-[#d4b7d6] hover:bg-white/10 hover:text-white">Load library</button></div>;
}

function LibraryError({ error }: { error: string }) { return <div className="rounded-xl border border-[#e25362]/25 bg-[#e25362]/10 p-3.5"><div className="flex gap-2 text-sm font-semibold text-[#ffb7bd]"><CircleAlert size={16} className="mt-0.5 shrink-0" /> Library unavailable</div><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-4 text-[#d49ca2]">{error}</pre></div>; }

function ChatDesk({ selectedCharacter, messages, messageInput, roomId, loading, onInput, onSend, messagesEndRef }: { selectedCharacter?: Character; messages: ChatMessage[]; messageInput: string; roomId: string; loading: boolean; onInput: (next: string) => void; onSend: () => void; messagesEndRef: React.RefObject<HTMLDivElement | null> }) {
  return <section className="relative flex min-h-[570px] flex-col overflow-hidden rounded-xl border border-[#e8c8ed]/10 bg-[#0c080d]">
    {selectedCharacter ? <>
      <div className="flex items-center justify-between border-b border-[#e8c8ed]/10 bg-[#130815] px-4 py-3.5"><div className="flex items-center gap-3"><Avatar character={selectedCharacter} size="h-10 w-10" /><div><div className="text-sm font-semibold text-white">{selectedCharacter.name}</div><div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#9e859f]"><span className="h-1.5 w-1.5 rounded-full bg-[#80c398]" />Ready to chat</div></div></div>{roomId && <code className="hidden rounded bg-white/5 px-2 py-1 font-mono text-[10px] text-[#9d849f] sm:block">room · {roomId.slice(0, 12)}…</code>}</div>
      <div className="relative flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {!messages.length && <div className="flex min-h-full flex-col items-center justify-center text-center"><img src="/manus-storage/oh-api-terminal-orbit_cecbd878.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.23]" /><div className="relative z-10 max-w-sm rounded-2xl border border-white/10 bg-[#110113]/85 p-5 backdrop-blur-sm"><span className="micro-label text-[#fc7a1d]">Conversation initialized</span><h3 className="mt-2 text-lg font-semibold text-white">Start chatting with {selectedCharacter.name}.</h3><p className="mt-2 text-sm leading-6 text-[#a891aa]">Your first message creates a room if one is not already active, then streams the reply into this thread.</p></div></div>}
        {messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-[#fc7a1d] text-[#291209]" : "rounded-bl-md border border-[#e8c8ed]/10 bg-[#251127] text-[#eee1ef]"}`}>{message.content}</div></div>)}
        {loading && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[#e8c8ed]/10 bg-[#251127] px-4 py-3 text-sm text-[#c9afcc]"><Loader2 size={15} className="animate-spin text-[#fc7a1d]" />Thinking…</div></div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t border-[#e8c8ed]/10 bg-[#100912] p-3 sm:p-4"><div className="flex gap-2 rounded-xl border border-[#ead0ee]/10 bg-black/25 p-1.5 focus-within:border-[#913cdd]/60"><input value={messageInput} onChange={(event) => onInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} placeholder={`Message ${selectedCharacter.name}…`} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-[#725c73]" /><button onClick={onSend} disabled={loading || !messageInput.trim()} className="pressable flex h-9 w-9 items-center justify-center rounded-lg bg-[#fc7a1d] text-[#2a1209] hover:bg-[#ff9145] disabled:cursor-not-allowed disabled:opacity-45" aria-label="Send message">{loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button></div><div className="mt-2 px-2 font-mono text-[10px] text-[#755e77]">Enter to send · Shift+Enter for a new line</div></div>
    </> : <div className="flex flex-1 flex-col items-center justify-center px-5 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#913cdd]/25 bg-[#913cdd]/10"><MessageCircle className="text-[#c692f8]" /></div><h3 className="mt-4 text-lg font-semibold text-white">Choose a character to begin.</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[#9d859f]">Load the character library with your API key, then select someone from the left station.</p></div>}
  </section>;
}

function MediaStation({ title, description, selectedCharacter, characters, selectedCharacterId, onSelect, onLoad, loadingCharacters, characterError, children }: { title: string; description: string; selectedCharacter?: Character; characters: Character[]; selectedCharacterId: string; onSelect: (id: string) => void; onLoad: () => void; loadingCharacters: boolean; characterError: string; children: React.ReactNode }) {
  return <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]"><CharacterLibrary characters={characters} selectedCharacterId={selectedCharacterId} loading={loadingCharacters} error={characterError} onLoad={onLoad} onSelect={onSelect} /><section className="min-h-[570px] rounded-xl border border-[#e8c8ed]/10 bg-[#0c080d] p-5 sm:p-7"><div className="flex items-start gap-3 border-b border-[#e8c8ed]/10 pb-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fc7a1d]/12 text-[#fc7a1d]"><Sparkles size={18} /></div><div><div className="micro-label text-[#a48aa6]">Async generation</div><h3 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-white">{title}</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-[#a18aa3]">{description}</p></div></div><div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_250px]"><div className="space-y-5">{children}</div><SelectedCharacterPanel character={selectedCharacter} /></div></section></div>;
}

function SelectedCharacterPanel({ character }: { character?: Character }) { return <aside className="h-fit overflow-hidden rounded-xl border border-[#e8c8ed]/10 bg-[#160a18]"><div className="micro-label border-b border-[#e8c8ed]/10 px-4 py-3 text-[#927594]">Attached identity</div>{character ? <><div className="relative h-40 bg-[#28132b]">{character.profile_image_url ? <img src={character.profile_image_url} alt="" className="h-full w-full object-cover opacity-80" /> : <div className="flex h-full items-center justify-center text-4xl font-bold text-[#bd8ac3]">{character.name.slice(0, 1)}</div>}<div className="absolute inset-0 bg-gradient-to-t from-[#160a18] via-transparent to-transparent" /></div><div className="p-4"><div className="font-semibold text-white">{character.name}</div><p className="mt-1 text-xs leading-5 text-[#a78fa9]">{character.occupation || "Selected character context"}</p><div className="mt-3 flex items-center gap-2 text-xs text-[#f1bd91]"><Check size={14} className="text-[#fc7a1d]" /> Character ID attached</div></div></> : <div className="p-5 text-sm leading-6 text-[#9c849e]">Select a character from the library to attach its ID to this request.</div>}</aside>; }

function PromptField({ label, value, onChange, placeholder, rows }: { label: string; value: string; onChange: (next: string) => void; placeholder: string; rows: number }) { return <label className="block"><span className="micro-label mb-2 block text-[#a58aa7]">{label}</span><textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full resize-y rounded-xl border border-[#ead0ee]/10 bg-[#09070a]/75 px-4 py-3 text-sm leading-6 text-[#f7eff8] outline-none transition placeholder:text-[#725d74] focus:border-[#913cdd] focus:ring-2 focus:ring-[#913cdd]/15" /></label>; }

function SingleField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (next: string) => void; placeholder: string }) { return <label className="block"><span className="micro-label mb-2 block text-[#a58aa7]">{label}</span><input type="url" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-[#ead0ee]/10 bg-[#09070a]/75 px-4 text-sm text-white outline-none transition placeholder:text-[#725d74] focus:border-[#913cdd] focus:ring-2 focus:ring-[#913cdd]/15" /></label>; }

function ActionButton({ pending, label, icon: Icon, onClick }: { pending: boolean; label: string; icon: typeof Play; onClick: () => void }) { return <button onClick={onClick} disabled={pending} className="pressable flex w-full items-center justify-center gap-2 rounded-xl bg-[#fc7a1d] px-5 py-3 text-sm font-bold text-[#2d1309] shadow-[0_12px_24px_rgba(252,122,29,0.16)] hover:bg-[#ff8b37] disabled:cursor-not-allowed disabled:opacity-55">{pending ? <Loader2 size={17} className="animate-spin" /> : <Icon size={17} />}{pending ? "Waiting for job…" : label}</button>; }

function GenerationOutput({ kind, result, pending, error }: { kind: "image" | "video" | "audio"; result: GenerationResult | null; pending: boolean; error: string }) {
  if (error) return <ResponseProblem title="Generation diagnostics" error={error} />;
  if (!result && !pending) return <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-[#dcb9e1]/15 bg-[#120b14] px-5 text-center"><CircleDashed size={24} className="text-[#765079]" /><p className="mt-3 text-sm font-semibold text-[#d5bdd8]">Result station is ready.</p><p className="mt-1 max-w-sm text-xs leading-5 text-[#907992]">The completed {kind} appears here along with its job status and returned presigned URL.</p></div>;
  const completed = result?.status && ["completed", "succeeded", "success", "ready"].includes(result.status.toLowerCase());
  return <section className="overflow-hidden rounded-xl border border-[#ead0ee]/10 bg-[#120a14]"><div className="flex items-center justify-between border-b border-[#ead0ee]/10 px-4 py-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${pending ? "running-dot bg-[#fc7a1d]" : completed ? "bg-[#86d7a0]" : "bg-[#ffba7d]"}`} /><span className="micro-label text-[#a78daa]">Job state</span></div><span className={`font-mono text-xs ${statusTone(result?.status ?? "queued")}`}>{result?.status || "queued"}</span></div><div className="p-4">{pending && <div className="flex min-h-28 items-center justify-center gap-3 text-sm text-[#b79db9]"><Loader2 className="animate-spin text-[#fc7a1d]" size={18} /> Polling every 2 seconds…</div>}{!pending && result?.url && kind === "image" && <img src={result.url} alt="Generated output" className="max-h-[520px] w-full rounded-lg object-contain" />}{!pending && result?.url && kind === "video" && <video src={result.url} className="max-h-[520px] w-full rounded-lg bg-black" controls />}{!pending && result?.url && kind === "audio" && <audio src={result.url} className="w-full" controls />}{!pending && !result?.url && <p className="text-sm text-[#bda4bf]">The job completed without a display URL in the response. Check the result payload or job endpoint.</p>}{result?.jobId && <p className="mt-3 break-all font-mono text-[10px] leading-5 text-[#837085]">job_id · {result.jobId}</p>}{result?.url && <a href={result.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] text-[#ffbd8d] hover:text-[#ffe2ce]">Open presigned result <ArrowUpRight size={12} /></a>}</div></section>;
}

function CamStation({ selectedCharacter, characters, selectedCharacterId, webhookUrl, result, loading, error, onSelect, onLoad, onWebhook, onCreate, loadingCharacters, characterError, onCopy }: { selectedCharacter?: Character; characters: Character[]; selectedCharacterId: string; webhookUrl: string; result: Record<string, unknown> | null; loading: boolean; error: string; onSelect: (id: string) => void; onLoad: () => void; onWebhook: (value: string) => void; onCreate: () => void; loadingCharacters: boolean; characterError: string; onCopy: (label: string, value: unknown) => void }) {
  const sessionId = result?.session_id ?? result?.sessionId ?? result?.id;
  const avatarUrl = result?.avatar_url ?? result?.avatarUrl ?? result?.url;
  const authToken = result?.auth_token ?? result?.authToken ?? result?.token;
  const samples = [
    { name: "LOGIN", data: { event: "LOGIN", session_id: "<session_id>", timestamp: "2026-08-15T10:39:00Z" } },
    { name: "CHAT", data: { event: "CHAT", session_id: "<session_id>", message: "Hello", timestamp: "2026-08-15T10:39:10Z" } },
    { name: "LOGOUT", data: { event: "LOGOUT", session_id: "<session_id>", timestamp: "2026-08-15T10:40:00Z" } },
  ];
  return <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]"><CharacterLibrary characters={characters} selectedCharacterId={selectedCharacterId} loading={loadingCharacters} error={characterError} onLoad={onLoad} onSelect={onSelect} /><section className="min-h-[570px] rounded-xl border border-[#e8c8ed]/10 bg-[#0c080d] p-5 sm:p-7"><div className="flex gap-3 border-b border-[#e8c8ed]/10 pb-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#913cdd]/15 text-[#cba0f2]"><Webhook size={18} /></div><div><div className="micro-label text-[#a48aa6]">Live session</div><h3 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-white">Create a Cam session</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-[#a18aa3]">Attach the selected character and set the webhook endpoint where your integration receives Cam events.</p></div></div><div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_250px]"><div className="space-y-5"><SingleField label="Your webhook URL" value={webhookUrl} onChange={onWebhook} placeholder="https://your-app.com/webhooks/oh-cam" /><ActionButton pending={loading} label="Create Cam session" icon={VideoIcon} onClick={onCreate} />{error && <ResponseProblem title="Cam diagnostics" error={error} />}{result && <section className="overflow-hidden rounded-xl border border-[#ead0ee]/10 bg-[#120a14]"><div className="flex items-center gap-2 border-b border-[#ead0ee]/10 px-4 py-3"><Check size={15} className="text-[#86d7a0]" /><span className="micro-label text-[#a78daa]">Session credentials</span></div><div className="divide-y divide-[#ead0ee]/10">{[{ label: "Session ID", value: sessionId }, { label: "Avatar URL", value: avatarUrl }, { label: "Auth Token", value: authToken }].map((field) => <div key={field.label} className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><div className="micro-label text-[#8f7491]">{field.label}</div>{field.label === "Avatar URL" && typeof field.value === "string" ? <a href={field.value} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-xs text-[#ffbb89] hover:text-[#ffe0ca]">{field.value}</a> : <div className="mt-1 break-all font-mono text-xs leading-5 text-[#ead9ec]">{String(field.value ?? "Not returned")}</div>}</div><button onClick={() => onCopy(field.label, field.value ?? "")} className="pressable rounded-md p-2 text-[#a98aac] hover:bg-white/5 hover:text-white" aria-label={`Copy ${field.label}`}><Clipboard size={15} /></button></div>)}</div></section>}</div><SelectedCharacterPanel character={selectedCharacter} /></div>{result && <div className="mt-6 border-t border-[#ead0ee]/10 pt-6"><div className="micro-label text-[#a48aa6]">Example webhook payloads</div><div className="mt-3 grid gap-3 lg:grid-cols-3">{samples.map((sample) => <div key={sample.name} className="overflow-hidden rounded-xl border border-[#ead0ee]/10 bg-[#120a14]"><div className="flex items-center justify-between border-b border-[#ead0ee]/10 px-3 py-2"><span className="font-mono text-xs font-semibold text-[#d4a5f4]">{sample.name}</span><button onClick={() => onCopy(`${sample.name} payload`, sample.data)} className="pressable rounded p-1.5 text-[#98799b] hover:bg-white/5 hover:text-white" aria-label={`Copy ${sample.name} payload`}><Clipboard size={14} /></button></div><pre className="overflow-x-auto p-3 font-mono text-[10px] leading-5 text-[#a68da8]">{JSON.stringify(sample.data, null, 2)}</pre></div>)}</div></div>}</section></div>;
}

function ResponseProblem({ title, error }: { title: string; error: string }) { return <section className="rounded-xl border border-[#e25362]/25 bg-[#e25362]/10 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#ffc1c6]"><CircleAlert size={16} />{title}</div><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-[#dfaab0]">{error}</pre></section>; }
