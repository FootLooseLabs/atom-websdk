export default class WebMessage extends Muffin.Lexeme {
    static DOC_STRING = "WebMessage Lexeme";

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
