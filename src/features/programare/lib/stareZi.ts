export type StareZi = 'viitor' | 'facut' | 'partial' | 'nefacut';

export interface BlocStareZi {
  tip: string;
  are_rezultat: boolean;
  ascuns?: boolean;
}

/** Datele ISO se compară ca zile; încălzirea și blocurile ascunse nu cer rezultat. */
export const stareZi = (data: string, azi: string, blocuri: readonly BlocStareZi[]): StareZi => {
  if (data > azi) return 'viitor';
  const urmarite = blocuri.filter(bloc => bloc.tip !== 'warm_up' && !bloc.ascuns);
  const facute = urmarite.filter(bloc => bloc.are_rezultat).length;
  if (facute === 0) return 'nefacut';
  return facute === urmarite.length ? 'facut' : 'partial';
};
