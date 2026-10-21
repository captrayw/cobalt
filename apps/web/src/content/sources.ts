/** The evidence behind each rule, numbered as in the build brief. */
export interface Source {
  n: number;
  cite: string;
  url: string;
}

export const SOURCES: readonly Source[] = [
  { n: 1, cite: 'Yang, Mousavi, Dash, et al. Studying behavioral addiction by combining surveys and digital traces: a case study of TikTok. ICWSM 2025.', url: 'https://arxiv.org/pdf/2501.15539' },
  { n: 2, cite: 'Masood, Kannan, Liu, et al. Counting how the seconds count: algorithm-user interplay in TikTok. CHI 2026.', url: 'https://doi.org/10.1145/3772318.3790311' },
  { n: 3, cite: 'WebKit Bugzilla 237322: Web Audio is muted when the iOS ringer is muted. 2024.', url: 'https://bugs.webkit.org/show_bug.cgi?id=237322' },
  { n: 4, cite: 'W3C WAI. Understanding Success Criterion 2.3.1: Three flashes or below threshold.', url: 'https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold' },
  { n: 5, cite: 'MedlinePlus Genetics. Color vision deficiency.', url: 'https://medlineplus.gov/genetics/condition/color-vision-deficiency/' },
  { n: 6, cite: 'Brainard, Hanifin, Greeson, et al. Action spectrum for melatonin regulation in humans. Journal of Neuroscience, 2001.', url: 'https://pubmed.ncbi.nlm.nih.gov/11487664/' },
  { n: 7, cite: 'Valdez & Mehrabian. Effects of color on emotions. Journal of Experimental Psychology: General, 1994.', url: 'https://doi.org/10.1037/0096-3445.123.4.394' },
  { n: 8, cite: 'Wilms & Oberfeld. Color and emotion: effects of hue, saturation, and brightness. Psychological Research, 2018.', url: 'https://doi.org/10.1007/s00426-017-0880-8' },
  { n: 9, cite: 'Jonauskaite, Abu-Akel, Dael, et al. Universal patterns in color-emotion associations. Psychological Science, 2020.', url: 'https://doi.org/10.1177/0956797620948810' },
  { n: 10, cite: 'Weijs, Jonauskaite, Reutimann, et al. Effects of environmental colours in virtual reality. Royal Society Open Science, 2023.', url: 'https://doi.org/10.1098/rsos.230432' },
  { n: 11, cite: 'Heiderscheit & Madson. Use of the iso principle as a central method in mood management. Music Therapy Perspectives, 2015.', url: 'https://doi.org/10.1093/mtp/miu042' },
  { n: 12, cite: 'Goldschmidt. Investigating the iso principle: musical tempo manipulation and arousal shift. Thesis, Colorado State University, 2020.', url: 'https://mountainscholar.org/items/ac2b73fc-81c1-4fb4-8712-a9dec090c828' },
  { n: 13, cite: 'de Witte, Spruit, van Hooren, et al. Effects of music interventions on stress-related outcomes. Health Psychology Review, 2020.', url: 'https://doi.org/10.1080/17437199.2019.1627897' },
  { n: 14, cite: 'Bernardi, Porta & Sleight. Cardiovascular, cerebrovascular, and respiratory changes induced by music: the importance of silence. Heart, 2006.', url: 'https://doi.org/10.1136/hrt.2005.064600' },
  { n: 15, cite: 'Ward, Huckstep & Tsakanikos. Sound-colour synaesthesia: cross-modal mechanisms common to us all? Cortex, 2006.', url: 'https://doi.org/10.1016/S0010-9452(08)70352-6' },
  { n: 16, cite: 'Spence. Crossmodal correspondences: a tutorial review. Attention, Perception, & Psychophysics, 2011.', url: 'https://doi.org/10.3758/s13414-010-0073-7' },
  { n: 17, cite: 'Palmer, Schloss, Xu, et al. Music-color associations are mediated by emotion. PNAS, 2013.', url: 'https://doi.org/10.1073/pnas.1212562110' },
  { n: 18, cite: 'Scarratt, Heggli, Vuust, et al. The audio features of sleep music. PLOS ONE, 2023.', url: 'https://doi.org/10.1371/journal.pone.0278813' },
  { n: 19, cite: 'Calamassi & Pomponi. Music tuned to 440 Hz versus 432 Hz and the health effects: a pilot study. Explore, 2019; corrigendum 2020.', url: 'https://doi.org/10.1016/j.explore.2019.04.001' },
  { n: 20, cite: 'Zaccaro, Piarulli, Laurino, et al. How breath-control can change your life: psycho-physiological correlates of slow breathing. Frontiers in Human Neuroscience, 2018.', url: 'https://doi.org/10.3389/fnhum.2018.00353' },
  { n: 21, cite: 'Shaffer & Meehan. A practical guide to resonance frequency assessment for HRV biofeedback. Frontiers in Neuroscience, 2020.', url: 'https://doi.org/10.3389/fnins.2020.570400' },
  { n: 22, cite: 'Lehrer & Gevirtz. Heart rate variability biofeedback: how and why does it work? Frontiers in Psychology, 2014.', url: 'https://doi.org/10.3389/fpsyg.2014.00756' },
  { n: 23, cite: 'Van Diest, Verstappen, Aubert, et al. Inhalation/exhalation ratio modulates the effect of slow breathing. Applied Psychophysiology and Biofeedback, 2014.', url: 'https://doi.org/10.1007/s10484-014-9253-x' },
  { n: 24, cite: 'Elliott & Izzo. Device-guided breathing to lower blood pressure. Medscape General Medicine, 2006.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1781326/' },
  { n: 25, cite: 'Leslie, Ghandeharioun, Zhou, et al. Engineering music to slow breathing and invite relaxed physiology. ACII 2019.', url: 'https://doi.org/10.1109/ACII.2019.8925531' },
  { n: 26, cite: 'Bayer et al. Rocking synchronizes brain waves during a short nap. Current Biology, 2011.', url: 'https://doi.org/10.1016/j.cub.2011.05.012' },
  { n: 27, cite: 'Tsai, Kuo, Lee, et al. Efficacy of paced breathing for insomnia. Psychophysiology, 2015.', url: 'https://doi.org/10.1111/psyp.12333' },
  { n: 28, cite: 'Rankin, Abrams, Barry, et al. Habituation revisited. Neurobiology of Learning and Memory, 2009.', url: 'https://doi.org/10.1016/j.nlm.2008.09.012' },
  { n: 29, cite: 'Gingras, Pohler & Fitch. Exploring shamanic journeying: repetitive drumming with shamanic instructions. PLOS ONE, 2014.', url: 'https://doi.org/10.1371/journal.pone.0102103' },
  { n: 30, cite: 'Kirsch & Braffman. Imaginative suggestibility and hypnotizability. Current Directions in Psychological Science, 2001.', url: 'https://doi.org/10.1111/1467-8721.00115' },
  { n: 31, cite: 'Zannettou, Nemes-Nemeth, Ayalon, et al. Leveraging rights of data subjects for social media analysis: TikTok data donations. 2023.', url: 'https://ar5iv.labs.arxiv.org/html/2301.04945' },
  { n: 32, cite: 'Yi, Hong, Zhong, et al. Beyond clicks: dwell time for personalization. RecSys 2014.', url: 'https://recsys.acm.org/recsys14/session-metrics-evaluation/' },
  { n: 33, cite: 'Zhan, Pei, Su, et al. Deconfounding duration bias in watch-time prediction for video recommendation. KDD 2022.', url: 'https://doi.org/10.1145/3534678.3539092' },
  { n: 34, cite: 'Vombatkere, Mousavi, Zannettou, et al. TikTok and the art of personalization: exploration and exploitation. WWW 2024.', url: 'https://doi.org/10.1145/3589334.3645600' },
  { n: 35, cite: 'Chapelle & Li. An empirical evaluation of Thompson sampling. NIPS 2011.', url: 'https://papers.nips.cc/paper/2011/hash/e53a0a2978c28872a4505bdb51db06dc-Abstract.html' },
];
