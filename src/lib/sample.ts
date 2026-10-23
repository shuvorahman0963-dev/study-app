import type { ExportFile } from './importer'

const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Small demo data: one theory subject and one math subject. */
export const sampleData = (): ExportFile[] => [
  {
    subject: { name: 'Sample: Textile Theory', code: 'DEMO 101', type: 'theory', examDate: inDays(12) },
    chapters: [
      {
        title: 'Water for Wet Processing',
        topics: [
          {
            title: 'Water hardness',
            pastPaperFrequency: 5,
            marks: 6,
            notes: 'Define hardness, temporary vs permanent, problems with reactions.',
            cards: [
              { front: 'What is hard water?', back: 'Water containing dissolved Ca and Mg salts that does not readily form lather with soap.', tags: ['definition'] },
              { front: 'Temporary hardness কী দিয়ে হয়?', back: 'Bicarbonates of Ca and Mg. Removed by boiling: $\\mathrm{Ca(HCO_3)_2 \\xrightarrow{\\Delta} CaCO_3\\downarrow + H_2O + CO_2\\uparrow}$', tags: ['reaction'] },
              { front: 'Total hardness = ?', back: '$$\\text{Total} = \\text{Temporary} + \\text{Permanent}$$', tags: ['formula'] },
            ],
          },
          {
            title: 'Zeolite process',
            pastPaperFrequency: 3,
            marks: 6,
            cards: [
              { front: 'Zeolite regeneration reaction?', back: '$\\mathrm{CaZ + 2NaCl \\rightarrow Na_2Z + CaCl_2}$ using 10% brine.', tags: ['reaction'] },
              { front: 'Zeolite vs ion exchange: main difference?', back: 'Zeolite swaps Ca/Mg for Na (Na salts remain). Ion exchange removes all ions and gives DM water.', tags: ['difference'] },
            ],
          },
        ],
      },
    ],
    pastPapers: [
      { year: 2023, exam: 'Term Final', questions: [{ text: 'State the problems due to hardness in water with reactions.', marks: 6, topic: 'Water hardness' }] },
    ],
  },
  {
    subject: { name: 'Sample: Fluid Mechanics', code: 'DEMO 102', type: 'math', examDate: inDays(9) },
    chapters: [
      {
        title: 'Fluid Statics',
        topics: [
          {
            title: 'Hydrostatic pressure',
            pastPaperFrequency: 4,
            marks: 10,
            cards: [
              { front: 'Hydrostatic pressure formula?', back: '$$p = \\rho g h$$ where $\\rho$ = density, $g$ = 9.81 m/s², $h$ = depth.', tags: ['formula'] },
              { front: 'Gauge vs absolute pressure?', back: '$p_{abs} = p_{gauge} + p_{atm}$', tags: ['formula'] },
            ],
            problems: [
              {
                kind: 'worked',
                title: 'Pressure at 5 m depth',
                problem: 'Find the gauge pressure at 5 m depth in water ($\\rho = 1000$ kg/m³).',
                steps: ['$p = \\rho g h$', '$p = 1000 \\times 9.81 \\times 5$', '$p = 49050$ Pa'],
                answer: '49.05 kPa',
              },
              {
                kind: 'practice',
                title: 'Pressure in oil',
                problem: 'Find the gauge pressure at 3 m depth in oil (SG = 0.85).',
                steps: ['$\\rho = 0.85 \\times 1000 = 850$ kg/m³', '$p = 850 \\times 9.81 \\times 3$', '$p = 25016$ Pa'],
                answer: '25.0 kPa',
              },
            ],
          },
        ],
      },
      {
        title: 'Fluid Dynamics',
        topics: [
          {
            title: 'Bernoulli equation',
            pastPaperFrequency: 5,
            marks: 12,
            cards: [
              { front: 'Bernoulli equation লেখো।', back: '$$\\frac{p}{\\rho g} + \\frac{V^2}{2g} + z = \\text{constant}$$', tags: ['formula'] },
              { front: 'Bernoulli equation এর assumptions?', back: 'Steady, incompressible, inviscid flow along a streamline.', tags: ['concept'] },
            ],
          },
        ],
      },
    ],
  },
]
