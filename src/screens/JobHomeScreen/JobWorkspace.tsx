import React, {createContext, useContext, useState} from 'react';
import type {JobMaterial} from '../../utils/nextJobImport';
type Workspace = {
  busy: boolean;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  drafts: Record<string, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  attachments: Record<string, JobMaterial[]>;
  setAttachments: React.Dispatch<
    React.SetStateAction<Record<string, JobMaterial[]>>
  >;
};
const Context = createContext<Workspace | null>(null);
export function JobWorkspace({children}: React.PropsWithChildren) {
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, JobMaterial[]>>(
    {},
  );
  return (
    <Context.Provider
      value={{busy, setBusy, drafts, setDrafts, attachments, setAttachments}}>
      {children}
    </Context.Provider>
  );
}
export function useJobWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing job workspace');
  return value;
}
export type JobStackParams = {
  JobHome: undefined;
  JobTask: {role: string};
  JobAgents: undefined;
};
