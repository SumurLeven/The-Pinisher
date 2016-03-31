var API = require('./api-functions'),
    RATE_LIMIT_EXCEEDED_TIMEOUT = 1000 * 60 * 10,     // 10 minutes
    RETWEET_TIMEOUT = 1000 * 15,                      // 15 seconds
    RATE_SEARCH_TIMEOUT = 1000 * 30,                  // 30 seconds

// Keywords you want to search + filtering retweets
    searchQueries = [
                     "keywords -filter:retweets OR keywords -filter:retweets",
                     "keywords -filter:retweets OR keywords -filter:retweets"
                    ],

    // "Specifies what type of search results you would prefer to receive. The current default is “mixed.” Valid values include:"
    // Default: "recent"   (return only the most recent results in the response)
    //          "mixed"    (Include both popular and real time results in the response)
    //          "popular"  (return only the most popular results in the response)
    RESULT_TYPE = "mixed",


// Main self-initializing function
(function() {
    var last_tweet_id = 0,
        searchResultsArr = [],
        blockedUsers = [],
        badTweetIds = [],
        limitLockout = false;

    /** The Callback function for the Search API */
    var searchCallback = function(response)
    {
        var payload = JSON.parse(response);

        // Iterating through tweets returned by the Search
        payload.statuses.forEach(function (searchItem)
        {
          // filters
		// user is not on our blocked list
                      if (blockedUsers.indexOf(searchItem.user.id) === -1)
                      {
                          // Save the search item in the Search Results array
                              searchResultsArr.push(searchItem);
                          
                      }
        
        });

        // If we have the next_results, search again for the rest (sort of a pagination)
        if (payload.search_metadata.next_results) {
            API.searchByStringParam(payload.search_metadata.next_results, searchCallback);
        }
    };

    function unlock()
    {
        console.log("Limit lockout time has passed, resuming program...");
        limitLockout = false;
    };

    /** The error callback for the Search API */
    var errorHandler = function (err) {
        console.error("Error!", err.message);

        // If the error is "Rate limit exceeded", code 88 - try again after 10 minutes
        if (JSON.parse(err.error).errors[0].code === 88)
        {
            console.log("After " + RATE_LIMIT_EXCEEDED_TIMEOUT / 60000 + " minutes, I will try again to fetch some results...");

            limitLockout = true; // suspend other functions from running while lockout is in effect

            // queue unsuspend of program
            setTimeout(function () {
                unlock();
            }, RATE_LIMIT_EXCEEDED_TIMEOUT);
        }
    };

    /** The Search function */
    var search = function()
    {
        // do not search if limit lockout is in effect
        if (limitLockout)
            return;

        console.log("Searching for tweets...");

        for (var i = 0; i < searchQueries.length; ++i)
        {
	// filter
            API.search({
                // Searching
                text: searchQueries[i],
                result_type: RESULT_TYPE,
                callback: searchCallback,
                error_callback: errorHandler,
                since_id: last_tweet_id
            });

            // we need to wait between search queries so we do not trigger rate limit lockout
            sleepFor(RATE_SEARCH_TIMEOUT);
            console.log("Sleeping between searches so we don't trigger rate limit...");
        }
    };


    /** The Punisher */
    var retweetWorker = function()
    {
        // Check if we have elements in the Result Array
        if (searchResultsArr.length)
        {
            // Pop the first element (by doing a shift() operation)
            var searchItem = searchResultsArr[0];
            searchResultsArr.shift();

            // Punish
		console.log("Reporting & blocking ", searchItem.id);
		blockedUsers.push(searchItem.user.id);
		API.blockUser(searchItem.user.id);
		API.reportUser(searchItem.user.id);
                              console.log("Blocking and reporting " + searchItem.user.id),
                function success()
                {
                    
                    // re-queue the punisher
                    setTimeout(function () {
                        retweetWorker();
                    }, RETWEET_TIMEOUT);
                },

                function error(errorCallback)
                {
                    // Currently will only apply to rate limit errors
                    if (errorCallback)
                        errorHandler(errorCallback);

                    console.error("Fail for", searchItem.id, ". Adding to blacklist.");

                    // If it fails, blacklist it
                    badTweetIds.push(searchItem.id);

                    // Then, re-start the RT Worker
                    setTimeout(function () {
                        retweetWorker();
                    }, RETWEET_TIMEOUT);
                }
            );
        }
        else // no search results left in array
        {
            if (limitLockout)
            {
                // we must schedule this to rerun, or else the program will exit when a lockout occurs
                setTimeout(function () {
                    retweetWorker();
                }, RATE_SEARCH_TIMEOUT);
                return;
            }

            console.log("No more results... will search and analyze again in " + RATE_SEARCH_TIMEOUT / 1000 + " seconds.");

            // go fetch new results
            search();

            setTimeout(function () {
                retweetWorker();
            }, RATE_SEARCH_TIMEOUT);
        }
    }

    function sleepFor(sleepDuration)
    {
        var now = new Date().getTime();
        while(new Date().getTime() < now + sleepDuration) { /* do nothing */ }
    }


    // Initializing function, begins the program.
    // First, gets the blocked users
    API.getBlockedUsers(function (blockedList) {

        blockedUsers = blockedList;

        // Start searching (the Search is in itself a worker, as the callback continues to fetch data)
        search();

        // Start the worker after short grace period for search results to come in
        setTimeout(function () {
            retweetWorker();
        }, 8000);
    });
}());