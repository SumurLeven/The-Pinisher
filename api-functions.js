var request = require('request-promise');
var oauth = require("./config");
var allItems = [];

//Callback functions
var callbacks = {
    default: function (response) {
        var result = JSON.parse(response);

        // Case when the callback is used after a search
        if (result && result.statuses) {
            result.statuses.forEach(function (item) {
                allItems.push(item.id);
            });

            console.log("So far we have a total of:", allItems.length);

            // If we have the next_results, search again for the rest (sort of a pagination)
            if (result.search_metadata.next_results) {
                API.searchByStringParam(result.search_metadata.next_results, callbacks.default);
            }
        }
    },

    processBlockedList: function (response) {
        var result = JSON.parse(response),
            blockedList = [];

        result.users.forEach(function (user) {
            blockedList.push(user.id);
        });
        console.log("Your list of blocked users:\n", blockedList);

        return blockedList;
    }
};

var API = {
    search: function (options) {
        params =
            "?q=" + encodeURIComponent(options.text),
            "&count=" + options.count ? options.count : 100,
            "&result_type=" + options.result_type ? options.result_type : 'popular',
            "&since_id=" + options.since_id ? options.since_id : 0;

        if (options.max_id) {
            params += "&max_id=" + options.max_id;
        }

        API.searchByStringParam(params, options.callback ? options.callback : callbacks.default, options.error_callback);
    },

    searchByStringParam: function (stringParams, callback, errorHandler) {
        request.get({url: 'https://api.twitter.com/1.1/search/tweets.json' + stringParams, oauth: oauth})
            .then(callback)
            .catch(function (err) {
                if (errorHandler) {
                    errorHandler(err);
                } else {
                    console.error("An error occurred:", err.message);
                }
            });
    },


    reporUser: function (userId) {
        request.post({url: 'https://api.twitter.com/1.1/users/report_spam.json?user_id=' + userId, oauth: oauth})
            .then(callbacks.default)
            .catch(function (err) {
                console.error(err.message);
            });
    },


    blockUser: function(userId)
    {
        request.post({url: 'https://api.twitter.com/1.1/blocks/create.json?user_id=' + userId, oauth: oauth})
            .then(callbacks.default)
            .catch(function(err)
            {
                console.error(err.message);
            });
    },


};

module.exports = API;
