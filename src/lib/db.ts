import { COLLECTIONS, listDocs, removeDoc, saveDoc } from './dataStore';

export const getHeroSlides = async () => {
  return listDocs(COLLECTIONS.heroSlides);
};

export const addHeroSlide = async (slide: any) => {
  await saveDoc(COLLECTIONS.heroSlides, String(slide.id), slide);
};

export const deleteHeroSlide = async (id: string) => {
  await removeDoc(COLLECTIONS.heroSlides, id);
};
