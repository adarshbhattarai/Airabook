import { pageTemplates } from '@/constants/pageTemplates';

class TemplateService {
    constructor() {
        this.templates = pageTemplates;
    }

    /**
     * Get a template definition by its type key (e.g., 'babyJournalPage')
     * @param {string} type 
     * @returns {object|null}
     */
    getTemplate(type) {
        return this.templates[type] || null;
    }

    /**
     * Get default content for a template
     * @param {string} type 
     * @returns {object}
     */
    getDefaultContent(type) {
        const template = this.getTemplate(type);
        return template ? { ...template.defaults } : {};
    }

    /**
     * Get the theme configuration for a template
     * @param {string} type 
     * @returns {object}
     */
    getTheme(type) {
        const template = this.getTemplate(type);
        return template?.theme || {};
    }

    /**
     * Get sections for a template
     * @param {string} type 
     * @returns {Array}
     */
    getSections(type) {
        const template = this.getTemplate(type);
        return template?.sections || [];
    }

    /**
     * Get sections organized by layout area (header, hero, bottom)
     * @param {string} type 
     * @returns {object} { header: [], hero: [], bottom: [] }
     */
    getLayoutSections(type) {
        const template = this.getTemplate(type);
        if (!template) return { header: [], hero: [], bottom: [] };

        const sectionsById = this.getSectionsMap(type);
        const layout = template.layout || {};

        return {
            header: (layout.header || []).map(id => sectionsById[id]).filter(Boolean),
            hero: (layout.hero || []).map(id => sectionsById[id]).filter(Boolean),
            bottom: (layout.bottom || []).map(id => sectionsById[id]).filter(Boolean),
        };
    }

    /**
     * Helper to get a map of sectionId -> sectionDef
     * @param {string} type 
     * @returns {object}
     */
    getSectionsMap(type) {
        const sections = this.getSections(type);
        const map = {};
        sections.forEach(section => {
            map[section.id] = section;
        });
        return map;
    }

    /**
     * Validate content against template requirements
     * (Placeholder for future validation logic)
     * @param {string} type 
     * @param {object} content 
     * @returns {boolean}
     */
    validateContent(type, content) {
        // Basic validation: ensure required fields exist?
        // For now, flexible.
        return true;
    }
}

// Singleton instance
export const templateService = new TemplateService();
