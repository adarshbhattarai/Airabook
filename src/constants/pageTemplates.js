export const babyJournalTemplateV1 = {
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
  layout: {
    header: ['title', 'date'],
    hero: ['image'],
    bottom: ['dadNotes', 'momNotes'],
  },
  sections: [
    {
      id: 'title',
      type: 'title',
      label: 'Page title',
      placeholder: 'Week 1 highlights',
      field: 'title',
    },
    {
      id: 'date',
      type: 'date',
      label: 'Date',
      field: 'date',
    },
    {
      id: 'image',
      type: 'image',
      label: 'Center photo',
      field: 'imageUrl',
      aspect: '4/5',
    },
    {
      id: 'dadNotes',
      type: 'qa',
      label: 'Dad',
      question: 'Dad reflection',
      placeholder: 'Today we discovered...',
      field: 'dadNotes',
    },
    {
      id: 'momNotes',
      type: 'qa',
      label: 'Mom',
      question: 'Mom reflection',
      placeholder: 'I want to remember...',
      field: 'momNotes',
    },
  ],
};

export const pageTemplates = {
  babyJournalPage: babyJournalTemplateV1,
};
