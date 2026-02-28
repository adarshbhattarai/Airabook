// Starter template for baby journal pages used during book creation seeding
const babyJournalTemplateV1 = {
  type: 'babyJournalPage',
  templateVersion: 'v1',
  defaults: {
    imageUrl: '',
    dadNotes: '',
    momNotes: '',
    title: '',
    date: '',
  },
  theme: {
    bg: 'soft-peach',
    accent: 'teal',
    font: 'serif',
  },
};

module.exports = { babyJournalTemplateV1 };
