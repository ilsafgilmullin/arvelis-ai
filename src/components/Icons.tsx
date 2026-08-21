import type { ReactNode } from 'react';

function IconFrame({ children }: { children: ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export const HomeIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="M4 10.6 12 4l8 6.6v8.1A1.3 1.3 0 0 1 18.7 20h-4.2v-5.8h-5V20H5.3A1.3 1.3 0 0 1 4 18.7Z" /></svg></IconFrame>;
export const ChatIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="M5.2 5.5h13.6A2.2 2.2 0 0 1 21 7.7v7.6a2.2 2.2 0 0 1-2.2 2.2h-6.7l-4.7 3v-3H5.2A2.2 2.2 0 0 1 3 15.3V7.7a2.2 2.2 0 0 1 2.2-2.2Z" /></svg></IconFrame>;
export const HistoryIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="M4.7 7.4V3.8M4.7 3.8h3.6M4.7 3.8A9 9 0 1 1 3.2 14.5" /><path d="M12 7.4V12l3.1 1.8" /></svg></IconFrame>;
export const ProfileIcon = () => <IconFrame><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M4.7 20c.8-3.9 3.3-5.9 7.3-5.9s6.5 2 7.3 5.9" /></svg></IconFrame>;
export const StateIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="M3.5 12h3.2l2.1-5.2 4.1 10.4 2.2-5.2h5.4" /></svg></IconFrame>;
export const PlusIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></IconFrame>;
export const SendIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="m4 4 16 8-16 8 3-8Z" /><path d="M7 12h13" /></svg></IconFrame>;
export const ArrowIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></IconFrame>;
export const ChevronDownIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="m5 9 7 7 7-7" /></svg></IconFrame>;
export const SearchIcon = () => <IconFrame><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.2" /><path d="m15.2 15.2 4.3 4.3" /></svg></IconFrame>;
export const CopyIcon = () => <IconFrame><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="1.8" /><path d="M16 8V5.8A1.8 1.8 0 0 0 14.2 4H5.8A1.8 1.8 0 0 0 4 5.8v8.4A1.8 1.8 0 0 0 5.8 16H8" /></svg></IconFrame>;
export const EditIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="m5 16.8-.8 3 3-.8L18 8.2 15.8 6Z" /><path d="m14.8 7 2.2 2.2" /></svg></IconFrame>;
export const CheckIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="m5 12.5 4.3 4.3L19 7" /></svg></IconFrame>;
export const TrashIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="M5.5 7.2h13M9 7.2V4.8h6v2.4M7.4 7.2l.7 12h7.8l.7-12M10 10.2v6M14 10.2v6" /></svg></IconFrame>;
export const ResetIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="M4.5 8.2V4.5h3.7M4.6 4.7a8.8 8.8 0 1 1-1.4 10.1" /></svg></IconFrame>;
export const SignOutIcon = () => <IconFrame><svg viewBox="0 0 24 24"><path d="M10 5H5.8A1.8 1.8 0 0 0 4 6.8v10.4A1.8 1.8 0 0 0 5.8 19H10" /><path d="M13 8.2 16.8 12 13 15.8M8.5 12h8.3" /></svg></IconFrame>;
