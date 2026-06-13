export type Card = {
  uuid: string;
  ankiNoteId?: number;
  front: string;
  back: string;
  filePath: string;
  deckPath: string;
  updatedAt: number;
};
