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
      placeholder: 'e.g., First Smile at 3 Months',
      helperText: 'Try titles like: "First Steps at the Park", "Tiny Laughs, Big Joy", or "A Calm Bedtime Night".',
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
      placeholder: 'What happened today, how did baby react, and why do you want to remember this?',
      guidance: 'Tip: write 2-4 short sentences about the moment, emotion, and one tiny detail to remember.',
      field: 'dadNotes',
    },
    {
      id: 'momNotes',
      type: 'qa',
      label: 'Mom',
      question: 'Mom reflection',
      placeholder: 'What happened today, how did baby react, and why do you want to remember this?',
      guidance: 'Tip: write 2-4 short sentences about the moment, emotion, and one tiny detail to remember.',
      field: 'momNotes',
    },
  ],
};

export const pageTemplates = {
  babyJournalPage: babyJournalTemplateV1,
};
