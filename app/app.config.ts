export default defineAppConfig({
  ui: {
    colors: { primary: 'amber', neutral: 'stone' },
    modal: { slots: { overlay: 'app-modal-overlay' } },
    slideover: { slots: { overlay: 'app-modal-overlay' } },
  },
})
