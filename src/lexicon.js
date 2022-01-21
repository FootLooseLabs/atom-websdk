const LEXICON = {};

LEXICON.WebMessage = class extends Muffin.Lexeme {
    static name = "";

    static request_schema = {
        uid: null,
        sender: null,
        params: {},
        subject: null,
        objective: {}
    }

    static schema = {
        interface: null,
        token: null,
        request: null,
        subscribe: null,
    }
}

export default LEXICON;
