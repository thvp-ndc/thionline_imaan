import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import MathInlineNodeView from './MathInlineNodeView';

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: element => {
          return element.getAttribute('data-latex') || element.textContent?.replace(/^\$|\$$/g, '') || '';
        },
        renderHTML: attributes => {
          return {
            'data-type': 'math-inline',
            'data-latex': attributes.latex || ''
          };
        }
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="math-inline"]'
      },
      {
        tag: 'span.tiptap-math-inline'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'tiptap-math-inline' }),
      `$${HTMLAttributes['data-latex'] || ''}$`
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineNodeView);
  }
});

export default MathInline;
