export type ChatUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: "admin" | "mother" | "wife" | "temp" | "friend";
};

export type ChatMessage = {
  msgId: string;
  text: string;
  status: "SENT" | "READ";
  sentAt: string;
  fromId: string;
  toId: string;
};
