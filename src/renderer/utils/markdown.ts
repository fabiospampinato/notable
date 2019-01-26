
/* IMPORT */

import 'highlight.js/styles/github';
import 'katex/dist/katex.min.css';
import * as _ from 'lodash';
import * as CRC32 from 'crc-32'; // Not a cryptographic hash function, but it's good enough (and fast!) for our purposes
import * as mermaid from 'mermaid';
import * as path from 'path';
import * as pify from 'pify';
import * as remark from 'remark';
import * as strip from 'strip-markdown';
import * as showdown from 'showdown';
import * as showdownHighlight from 'showdown-highlight';
import * as showdownKatex from 'showdown-katex-studdown';
import * as showdownTargetBlack from 'showdown-target-blank';
import Config from '@common/config';

/* MARKDOWN */

const Markdown = {

  converter: undefined,

  extensions: {

    encodeSpecialLinks () { // Or they won't be parsed as images/links whatever

      return [{
        type: 'language',
        regex: `\\[([^\\]]*)\\]\\(((?:${Config.attachments.token}|${Config.notes.token}|${Config.tags.token})/[^\\)]*)\\)`,
        replace ( match, $1, $2 ) {
          return `[${$1}](${encodeURI ( $2 )})`;
        }
      }];

    },

    attachment () {

      const {path: attachmentsPath, token} = Config.attachments;

      if ( !attachmentsPath ) return [];

      return [
        { // Image
          type: 'output',
          regex: `<img(.*?)src="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const filePath = path.join ( attachmentsPath, $2 );
            return `<img${$1}src="file://${filePath}" class="attachment" data-filename="${$2}"${$3}>`;
          }
        },
        { // Link Button
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)></a>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const basename = path.basename ( $2 );
            const filePath = path.join ( attachmentsPath, $2 );
            return `<a${$1}href="file://${filePath}" class="attachment button gray" data-filename="${$2}"${$3}><i class="icon small">paperclip</i><span>${basename}</span></a>`;
          }
        },
        { // Link
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const filePath = path.join ( attachmentsPath, $2 );
            return `<a${$1}href="file://${filePath}" class="attachment" data-filename="${$2}"${$3}><i class="icon xsmall">paperclip</i>`;
          }
        }
      ];

    },

    note () {

      const {path: notesPath, token} = Config.notes;

      if ( !notesPath ) return [];

      return [
        { // Link Button
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)></a>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const basename = path.basename ( $2 );
            const filePath = path.join ( notesPath, $2 );
            return `<a${$1}href="file://${filePath}" class="note button gray" data-filepath="${filePath}"${$3}><i class="icon small">note</i><span>${basename}</span></a>`;
          }
        },
        { // Link
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            const filePath = path.join ( notesPath, $2 );
            return `<a${$1}href="file://${filePath}" class="note" data-filepath="${filePath}"${$3}><i class="icon xsmall">note</i>`;
          }
        }
      ];

    },

    tag () {

      const {token} = Config.tags;

      return [
        { // Link Button
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)></a>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            return `<a${$1}href="#" class="tag button gray" data-tag="${$2}"${$3}><i class="icon small">tag</i><span>${$2}</span></a>`;
          }
        },
        { // Link
          type: 'output',
          regex: `<a(.*?)href="${token}/([^"]+)"(.*?)>`,
          replace ( match, $1, $2, $3 ) {
            $2 = decodeURI ( $2 );
            return `<a${$1}href="#" class="tag" data-tag="${$2}"${$3}><i class="icon xsmall">tag</i>`;
          }
        }
      ];

    },

    // Wikilink
    wikilink () {

      const {path: notesPath, re} = Config.notes;

      if ( !notesPath ) return [];

      var matches = [];
      return [
        { // Link
          type: 'lang',
          regex: /(?<!`)\[\[(.*?)\]\]/g,
          replace (match, $1, $2) {
            matches.push($1);
            var n = matches.length - 1;
            return '%PLACEHOLDER' + n + '%';
          }
        },
        {
          type: 'output',
          filter (text) {
                for (var i=0; i< matches.length; ++i) {
                    var content = matches[i]

                    var splits = content.split("|"); 

                    if (splits.length === 1) {
                      var wikiLink = splits[0].trim();
                      var linkText = splits[0].trim();
                    }
                    else {
                      var wikiLink = splits[1].trim();
                      var linkText = splits[0].trim();
                    };

                    wikiLink = decodeURI ( wikiLink );
                    
                    if (wikiLink.match(re)) {
                      var basename = wikiLink; 
                    } else {
                      var basename = [wikiLink, 'md'].join('.'); // the extension should be configurable (= default extension)
                    }

                    var filePath = path.join ( notesPath, basename ); 
                    var link = `<a href="@note/${basename}">${linkText}</a>`
                    
                    // find placeholder and replace with link
                    var pat = '%PLACEHOLDER' + i + '%';
                    var text = text.replace(new RegExp(pat, 'gi'), link);
                }
                //reset array
                matches = [];
                return text;
            }
        }
      ];

    },


    katex () {

      return showdownKatex ( Config.katex );

    },

    mermaid () {

      mermaid.initialize ( Config.mermaid );

      return [{
        type: 'language',
        regex: '```mermaid([^`]*)```',
        replace ( match, $1 ) {
          const svg = mermaid.render ( `mermaid-${CRC32.str ( $1 )}`, $1 );
          return `<div class="mermaid">${svg}</div>`;
        }
      }];

    }

  },

  getConverter () {

    if ( Markdown.converter ) return Markdown.converter;

    const {encodeSpecialLinks, attachment, note, tag, wikilink, katex, mermaid} = Markdown.extensions;

    const converter = new showdown.Converter ({
      metadata: true,
      extensions: [showdownHighlight, showdownTargetBlack, encodeSpecialLinks (),attachment (), wikilink (), note (), tag (),  katex (), mermaid ()]
    });

    converter.setFlavor ( 'github' );

    Markdown.converter = converter;

    return converter;

  },

  render: _.memoize ( ( str: string ): string => {

    return Markdown.getConverter ().makeHtml ( str );

  }),

  strip: async ( str: string ): Promise<string> => {

    return ( await pify ( remark ().use ( strip ).process )( str ) ).toString ();

  }

};

/* EXPORT */

export default Markdown;
