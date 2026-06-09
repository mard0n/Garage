export type Mapping = {
  ankiNoteId: number;
  path: string;
  lastSync: number;
};

export type State = Record<string, Mapping>;

export function emptyState(): State {
  return {};
}

export function getMapping(state: State, uuid: string): Mapping | undefined {
  return state[uuid];
}

export function findByAnkiId(state: State, ankiNoteId: number): [string, Mapping] | undefined {
  for (const [uuid, mapping] of Object.entries(state)) {
    if (mapping.ankiNoteId === ankiNoteId) {
      return [uuid, mapping];
    }
  }
  return undefined;
}

export function setMapping(state: State, uuid: string, mapping: Mapping): State {
  return { ...state, [uuid]: mapping };
}

export function removeMapping(state: State, uuid: string): State {
  const next = { ...state };
  delete next[uuid];
  return next;
}
