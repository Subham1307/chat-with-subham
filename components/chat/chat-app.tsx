"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { LoginScreen } from "@/components/chat/login-screen";
import type { ChatMessage, ChatUser } from "@/types/chat";

const ROLE_LABELS: Record<ChatUser["role"], string> = {
  admin: "Admin",
  mother: "Mother",
  wife: "what are we?",
  temp: "Temp",
  friend: "Friend",
};

const ROLE_COLORS: Record<ChatUser["role"], string> = {
  admin: "bg-violet-100 text-violet-700",
  mother: "bg-rose-100 text-rose-700",
  wife: "bg-amber-100 text-amber-700",
  temp: "bg-sky-100 text-sky-700",
  friend: "bg-emerald-100 text-emerald-700",
};

function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.msgId, message]));
  for (const message of incoming) {
    byId.set(message.msgId, message);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
}

export function ChatApp() {
  const { data: session, status } = useSession();
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<string>(new Date(0).toISOString());
  const markingSeenRef = useRef(false);

  const currentUserId = session?.user?.id;
  const isChatOpen = Boolean(
    selectedChatId && (isDesktop || mobileShowChat),
  );

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const filteredMessages = messages;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    setError(null);
    try {
      const response = await fetch("/api/chats");
      if (!response.ok) {
        throw new Error("Failed to load chats");
      }
      const data: ChatUser[] = await response.json();
      setChats(data);
      setSelectedChatId((current) => current ?? data[0]?.id ?? null);
    } catch {
      setError("Could not load chats. Please try again.");
    } finally {
      setLoadingChats(false);
    }
  }, []);

  const loadInitialMessages = useCallback(
    async (chatId: string, signal?: AbortSignal) => {
      setLoadingMessages(true);
      try {
        const response = await fetch(`/api/messages?withUserId=${chatId}`, {
          signal,
        });
        if (!response.ok) {
          throw new Error("Failed to load messages");
        }
        const data: ChatMessage[] = await response.json();
        setMessages(data);
        afterRef.current =
          data.length > 0
            ? data[data.length - 1].sentAt
            : new Date(0).toISOString();
      } catch (err) {
        if (signal?.aborted) return;
        setError("Could not load messages. Please try again.");
      } finally {
        if (!signal?.aborted) {
          setLoadingMessages(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadChats();
  }, [status, loadChats]);

  useEffect(() => {
    if (!isChatOpen || !selectedChatId || status !== "authenticated") {
      return;
    }

    const abortController = new AbortController();
    let active = true;

    setMessages([]);
    afterRef.current = new Date(0).toISOString();

    async function pollMessages(chatId: string) {
      while (active && !abortController.signal.aborted) {
        try {
          const params = new URLSearchParams({
            withUserId: chatId,
            after: afterRef.current,
            wait: "true",
          });
          const response = await fetch(`/api/messages?${params}`, {
            signal: abortController.signal,
          });

          if (!response.ok) {
            throw new Error("Failed to poll messages");
          }

          const newMessages: ChatMessage[] = await response.json();
          if (newMessages.length > 0) {
            setMessages((current) => mergeMessages(current, newMessages));
            afterRef.current = newMessages[newMessages.length - 1].sentAt;
          }
        } catch (err) {
          if (abortController.signal.aborted) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    void loadInitialMessages(selectedChatId, abortController.signal).then(
      () => {
        if (!active || abortController.signal.aborted) return;
        void pollMessages(selectedChatId);
      },
    );

    return () => {
      active = false;
      abortController.abort();
    };
  }, [isChatOpen, selectedChatId, status, loadInitialMessages]);

  useEffect(() => {
    if (!isChatOpen) {
      setMessages([]);
      setEditingMsgId(null);
      setEditDraft("");
    }
  }, [isChatOpen, selectedChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredMessages]);

  useEffect(() => {
    if (!isChatOpen || !selectedChatId || !currentUserId) return;

    const hasUnread = messages.some(
      (message) =>
        message.toId === currentUserId && message.status === "SENT",
    );

    if (!hasUnread || markingSeenRef.current) return;

    markingSeenRef.current = true;

    void fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withUserId: selectedChatId }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to mark messages as read");
        }
        const updated: ChatMessage[] = await response.json();
        if (updated.length > 0) {
          setMessages((current) => mergeMessages(current, updated));
        }
      })
      .catch(() => {
        // Silent fail — will retry on next message update
      })
      .finally(() => {
        markingSeenRef.current = false;
      });
  }, [messages, isChatOpen, selectedChatId, currentUserId]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedChatId || !draft.trim() || sending) return;

    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toId: selectedChatId, text: draft.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to send message");
      }

      const message: ChatMessage = await response.json();
      setDraft("");
      setMessages((current) => mergeMessages(current, [message]));
      afterRef.current = message.sentAt;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  function handleSelectChat(chatId: string) {
    setSelectedChatId(chatId);
    setMobileShowChat(true);
    setEditingMsgId(null);
    setEditDraft("");
  }

  function startEditing(message: ChatMessage) {
    setEditingMsgId(message.msgId);
    setEditDraft(message.text);
    setError(null);
  }

  function cancelEditing() {
    setEditingMsgId(null);
    setEditDraft("");
  }

  async function handleSaveEdit(msgId: string) {
    if (!editDraft.trim() || savingEdit) return;

    setSavingEdit(true);
    setError(null);
    try {
      const response = await fetch(`/api/messages/${msgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editDraft.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to edit message");
      }

      const updated: ChatMessage = await response.json();
      setMessages((current) => mergeMessages(current, [updated]));
      cancelEditing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to edit message");
    } finally {
      setSavingEdit(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (status !== "authenticated" || !session?.user) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">
            Chat with Subham
          </h1>
          <p className="text-xs text-zinc-500">
            Signed in as {session.user.name ?? session.user.email}
            {session.user.role
              ? ` · ${ROLE_LABELS[session.user.role as ChatUser["role"]] ?? session.user.role}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50"
        >
          Sign out
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${
            mobileShowChat ? "hidden sm:flex" : "flex"
          } w-full flex-col border-r border-zinc-200 bg-white sm:w-80`}
        >
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-900">Chats</h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingChats ? (
              <p className="px-4 py-6 text-sm text-zinc-500">Loading chats...</p>
            ) : chats.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">No chats yet.</p>
            ) : (
              chats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => handleSelectChat(chat.id)}
                  className={`flex w-full items-center gap-3 border-b border-zinc-50 px-4 py-4 text-left transition hover:bg-zinc-50 ${
                    selectedChatId === chat.id ? "bg-rose-50" : ""
                  }`}
                >
                  <UserAvatar user={chat} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-zinc-900">
                        {chat.name ?? chat.email}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ROLE_COLORS[chat.role]}`}
                      >
                        {ROLE_LABELS[chat.role]}
                      </span>
                    </div>
                    <p className="truncate text-xs text-zinc-500">{chat.email}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main
          className={`${
            mobileShowChat ? "flex" : "hidden sm:flex"
          } min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,#fff7f7_0%,#ffffff_120px)]`}
        >
          {selectedChat ? (
            <>
              <div className="flex items-center gap-3 border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
                <button
                  type="button"
                  onClick={() => setMobileShowChat(false)}
                  className="rounded-lg px-2 py-1 text-sm text-zinc-500 sm:hidden"
                >
                  ← Back
                </button>
                <UserAvatar user={selectedChat} />
                <div>
                  <p className="font-medium text-zinc-900">
                    {selectedChat.name ?? selectedChat.email}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {ROLE_LABELS[selectedChat.role]}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {loadingMessages && filteredMessages.length === 0 ? (
                  <p className="text-sm text-zinc-500">Loading messages...</p>
                ) : filteredMessages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-zinc-400">
                      No messages yet. Say hello!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredMessages.map((message) => {
                      const isMine = message.fromId === currentUserId;
                      const isEditing = editingMsgId === message.msgId;

                      return (
                        <div
                          key={message.msgId}
                          className={`flex items-end gap-1.5 ${
                            isMine ? "justify-end" : "justify-start"
                          }`}
                        >
                          {isMine && isEditing ? (
                            <div className="flex max-w-[80%] flex-col gap-2 rounded-2xl rounded-br-md bg-zinc-900 px-3 py-2.5 shadow-sm">
                              <input
                                type="text"
                                value={editDraft}
                                onChange={(event) =>
                                  setEditDraft(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void handleSaveEdit(message.msgId);
                                  }
                                  if (event.key === "Escape") {
                                    cancelEditing();
                                  }
                                }}
                                autoFocus
                                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-rose-400"
                              />
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  disabled={savingEdit}
                                  className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                                  title="Cancel"
                                >
                                  <CloseIcon />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveEdit(message.msgId)}
                                  disabled={!editDraft.trim() || savingEdit}
                                  className="flex h-7 w-7 items-center justify-center rounded-full text-emerald-400 transition hover:bg-zinc-800 disabled:opacity-50"
                                  title="Save"
                                >
                                  <CheckIcon />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div
                                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                                  isMine
                                    ? "rounded-br-md bg-zinc-900 text-white"
                                    : "rounded-bl-md bg-white text-zinc-900 ring-1 ring-zinc-100"
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words">
                                  {message.text}
                                </p>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <p className="text-[10px] text-zinc-400">
                                    {formatTime(message.sentAt)}
                                  </p>
                                  {isMine && message.status === "READ" ? (
                                    <span
                                      className="text-[10px] text-emerald-400"
                                      title="Read"
                                    >
                                      ✓✓
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              {isMine ? (
                                <button
                                  type="button"
                                  title="Edit message"
                                  onClick={() => startEditing(message)}
                                  className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:text-zinc-800"
                                >
                                  <EditIcon />
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {error ? (
                <div className="px-4 pb-2 sm:px-6">
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                  </p>
                </div>
              ) : null}

              <form
                onSubmit={handleSend}
                className="border-t border-zinc-200 bg-white px-4 py-4 sm:px-6"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sending}
                    className="rounded-2xl bg-rose-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? "..." : "Send"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-zinc-400">
                Select a chat to start messaging
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function UserAvatar({ user }: { user: ChatUser }) {
  const initials = (user.name ?? user.email)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-sm font-semibold text-zinc-600">
      {initials}
    </div>
  );
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="m2.695 14.363 1.372-1.372 9.193-9.193 1.372 1.372-9.193 9.193-1.372 1.372Zm-.707 2.829 1.372-1.372.353-.353 1.372 1.372-.353.353-1.372 1.372H2v-1.372Zm11.01-9.96 1.372-1.371a1 1 0 0 1 1.414 0l.586.586a1 1 0 0 1 0 1.414l-1.372 1.372-1.972-1.972Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 0 1 0 1.414l-7.25 7.25a1 1 0 0 1-1.414 0l-3.25-3.25a1 1 0 1 1 1.414-1.414L8.75 11.69l6.543-6.543a1 1 0 0 1 1.414 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
