import { Lexeme } from '@muffin/element';

const LEXICON = {};

LEXICON.WebMessage = class WebMessage extends Lexeme {
    static name = "WebMessage";

    static schema = {
        interface: null,
        token:     null,
        request:   null,
        subscribe: null,
        ttl:       null
    };

    static request_schema = {
        uid:       null,
        sender:    null,
        params:    {},
        subject:   null,
        objective: {}
    };
};

export default LEXICON;
