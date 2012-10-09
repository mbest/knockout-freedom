
describe('Expression Rewriting', {

    'Should be able to parse simple object literals': function() {
        var result = ko.expressionRewriting.parseObjectLiteral("a: 1, b: 2, \"quotedKey\": 3, 'aposQuotedKey': 4");
        value_of(result.length).should_be(4);
        value_of(result[0].key).should_be("a");
        value_of(result[0].value).should_be(" 1");
        value_of(result[1].key).should_be(" b");
        value_of(result[1].value).should_be(" 2");
        value_of(result[2].key).should_be(" \"quotedKey\"");
        value_of(result[2].value).should_be(" 3");
        value_of(result[3].key).should_be(" 'aposQuotedKey'");
        value_of(result[3].value).should_be(" 4");
    },

    'Should ignore any outer braces': function() {
        var result = ko.expressionRewriting.parseObjectLiteral("{a: 1}");
        value_of(result.length).should_be(1);
        value_of(result[0].key).should_be("a");
        value_of(result[0].value).should_be(" 1");
    },

    'Should be able to parse object literals containing string literals': function() {
        var result = ko.expressionRewriting.parseObjectLiteral("a: \"comma, colon: brace{ bracket[ apos' escapedQuot\\\" end\", b: 'escapedApos\\\' brace} bracket] quot\"'");
        value_of(result.length).should_be(2);
        value_of(result[0].key).should_be("a");
        value_of(result[0].value).should_be(" \"comma, colon: brace{ bracket[ apos' escapedQuot\\\" end\"");
        value_of(result[1].key).should_be(" b");
        value_of(result[1].value).should_be(" 'escapedApos\\\' brace} bracket] quot\"'");
    },

    'Should be able to parse object literals containing child objects, arrays, function literals, and newlines': function() {
        var result = ko.expressionRewriting.parseObjectLiteral(
            "myObject : { someChild: { }, someChildArray: [1,2,3], \"quotedChildProp\": 'string value' },\n"
          + "someFn: function(a, b, c) { var regex = /}/; var str='/})({'; return {}; },"
          + "myArray : [{}, function() { }, \"my'Str\", 'my\"Str']"
        );
        value_of(result.length).should_be(3);
        value_of(result[0].key).should_be("myObject ");
        value_of(result[0].value).should_be(" { someChild: { }, someChildArray: [1,2,3], \"quotedChildProp\": 'string value' }");
        value_of(result[1].key).should_be("\nsomeFn");
        value_of(result[1].value).should_be(" function(a, b, c) { var regex = /}/; var str='/})({'; return {}; }");
        value_of(result[2].key).should_be("myArray ");
        value_of(result[2].value).should_be(" [{}, function() { }, \"my'Str\", 'my\"Str']");
    },

    'Should be able to cope with malformed syntax (things that aren\'t key-value pairs)': function() {
        var result = ko.expressionRewriting.parseObjectLiteral("malformed1, 'mal:formed2', good:3, { malformed: 4 }");
        value_of(result.length).should_be(4);
        value_of(result[0].unknown).should_be("malformed1");
        value_of(result[1].unknown).should_be(" 'mal:formed2'");
        value_of(result[2].key).should_be(" good");
        value_of(result[2].value).should_be("3");
        value_of(result[3].unknown).should_be(" { malformed: 4 }");
    },

    'Should ensure all keys are wrapped in quotes': function() {
        var rewritten = ko.expressionRewriting.preProcessBindings("a: 1, 'b': 2, \"c\": 3");
        value_of(rewritten).should_be("'a':1,'b':2,'c':3");
    },

    'Should convert JSON values to property accessors': function () {
        ko.utils.extend(ko.bindingFreedom.twoWayBindings, {a:1,b:1,c:1,d:1,e:1,f:1,g:1,h:1,i:1,j:1});
        var rewritten = ko.expressionRewriting.preProcessBindings(
            'a : 1, b : firstName, c : function() { return "returnValue"; }, ' +
            'd: firstName+lastName, e: boss.firstName, f: boss . lastName, ' +
            'g: getAssitant(), h: getAssitant().firstName, i: getAssitant("[dummy]")[ "lastName" ], ' +
            'j: boss.firstName + boss.lastName'
        );
        ko.utils.extend(ko.bindingFreedom.twoWayBindings, {a:0,b:0,c:0,d:0,e:0,f:0,g:0,h:0,i:0,j:0});

        var assistant = { firstName: "john", lastName: "english" };
        var model = {
            firstName: "bob", lastName: "smith",
            boss: { firstName: "rick", lastName: "martin" },
            getAssitant: function() { return assistant }
        };
        with (model) {
            var parsed = eval("({" + rewritten + "})");
            // these don't allow writing and thus only have the value
            value_of(parsed.a).should_be(1);
            value_of(parsed.c()).should_be("returnValue");
            value_of(parsed.d).should_be("bobsmith");

            // these allow writing and have been converted to observables
            value_of(parsed.b()).should_be("bob");
            value_of(parsed.e()).should_be("rick");
            value_of(parsed.f()).should_be("martin");
            value_of(parsed.g()).should_be(assistant);
            value_of(parsed.h()).should_be("john");
            value_of(parsed.i()).should_be("english");
            value_of(parsed.j()).should_be("rickmartin");

            // make sure writing to them works
            parsed.b("bob2");
            value_of(model.firstName).should_be("bob2");
            parsed.e("rick2");
            value_of(model.boss.firstName).should_be("rick2");
            parsed.f("martin2");
            value_of(model.boss.lastName).should_be("martin2");
            parsed.h("john2");
            value_of(assistant.firstName).should_be("john2");
            parsed.i("english2");
            value_of(assistant.lastName).should_be("english2");

            // make sure writing to 'j' doesn't error or actually change anything
            parsed.j("nothing at all");
            value_of(model.boss.firstName).should_be("rick2");
            value_of(model.boss.lastName).should_be("martin2");
        }
    },

    'Should be able to eval rewritten literals that contain unquoted keywords as keys': function() {
        var rewritten = ko.expressionRewriting.preProcessBindings("if: true");
        value_of(rewritten).should_be("'if':true");
        var evaluated = eval("({" + rewritten + "})");
        value_of(evaluated['if']).should_be(true);
    }
});
