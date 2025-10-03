/**
 * Service for interacting with LeetCode's API to fetch problem data and submissions.
 * Handles authentication, rate limiting, and data transformation for synchronization.
 */
export default class LeetCodeService {
  /**
   * Initialize the LeetCode service with caching capability.
   */
  constructor() {
    this.cachedProblems = null;
  }

  /**
   * Fetches all questions from LeetCode GraphQL API with their difficulty levels.
   * Used to get comprehensive problem metadata.
   *
   * @returns {Promise<Object[]>} Array of question objects with questionId and difficulty
   */
  async fetchAllQuestionsDifficulty() {
    const graphqlQuery = {
      query: `
        query allQuestions {
          allQuestions {
            questionId
            difficulty
          }
        }
      `,
    };

    try {
      const response = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(graphqlQuery),
      });

      const data = await response.json();
      return data.data.allQuestions;
    } catch (error) {
      return [];
    }
  }

  /**
   * Retrieves the list of solved problems for the authenticated user.
   * Uses caching to avoid repeated API calls during the same session.
   *
   * Algorithm:
   * 1. Check if problems are already cached
   * 2. If not cached, fetch from LeetCode API with credentials
   * 3. Verify user is logged in by checking username
   * 4. Cache the results and filter for accepted solutions only
   *
   * @returns {Promise<Object[]>} Array of solved problem objects (status === "ac")
   * @throws {Error} If user is not logged in or API request fails
   */
  async getSolvedProblems() {
    try {
      if (this.cachedProblems) {
        return this.cachedProblems.filter((problem) => problem.status === "ac");
      }

      const response = await fetch("https://leetcode.com/api/problems/all/", {
        method: "GET",
        credentials: "include", // Include cookies for authentication
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Verify user authentication by checking username presence
      if (!data.user_name || data.user_name.trim() === "") {
        throw new Error(
          "You have not logged in to LeetCode. Please log in for syncing problems."
        );
      }

      this.cachedProblems = data.stat_status_pairs;

      return this.cachedProblems.filter((problem) => problem.status === "ac");
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retrieves submissions for a specific problem organized by programming language.
   * Implements comprehensive error handling and rate limiting.
   *
   * Algorithm:
   * 1. Add delay to respect API rate limits
   * 2. Fetch submission list for the problem (accepted only)
   * 3. Group submissions by language, keeping the most recent per language
   * 4. For each language, fetch detailed submission code
   * 5. Handle various error conditions (HTTP errors, GraphQL errors, rate limits)
   * 6. Return structured data with code and metadata
   *
   * Error Handling Strategy:
   * - HTTP 429/5xx errors: Set needsPause flag for retry with delay
   * - GraphQL errors: Set needsPause flag as likely rate limit
   * - Missing data: Set needsPause flag as API overload indicator
   * - Missing code: Skip submission but continue processing others
   *
   * @param {string} titleSlug - The problem's URL slug identifier
   * @returns {Promise<Object>} Object mapping language codes to submission data
   * @throws {Error} With needsPause property for rate limit scenarios
   */
  async getSubmissionsByLanguage(titleSlug) {
    try {
      // Delay to respect API rate limits
      await this.sleep(500);

      let allSubmissions = [];
      let offset = 0;
      let hasNext = true;
      let lastKey = null;
      const limit = 20;

      // Fetch all submissions with pagination
      while (hasNext) {
        const submissionsResponse = await fetch("https://leetcode.com/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            query: `
              query submissionList($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!, $lang: Int, $status: Int) {
    questionSubmissionList(
      offset: $offset
      limit: $limit
      lastKey: $lastKey
      questionSlug: $questionSlug
      lang: $lang
      status: $status
    ) {
      lastKey
      hasNext
      submissions {
        id
        title
        titleSlug
        status
        statusDisplay
        lang
        langName
        runtime
        timestamp
        url
        isPending
        memory
        hasNotes
        notes
        flagType
        frontendId
        topicTags {
          id
        }
      }
    }
  }
            `,
            variables: {
              questionSlug: titleSlug,
              offset: offset,
              limit: limit,
              lastKey: lastKey,
              status: 10, // Only accepted submissions
            },
          }),
        });

        // Check HTTP status for rate limiting indicators
        if (!submissionsResponse.ok) {
          const error = new Error(`HTTP error: ${submissionsResponse.status}`);
          error.needsPause =
            submissionsResponse.status === 429 ||
            submissionsResponse.status >= 500;
          throw error;
        }

        const submissionsData = await submissionsResponse.json();

        // Check for GraphQL errors which often indicate rate limiting
        if (submissionsData.errors) {
          const error = new Error(
            `GraphQL errors: ${submissionsData.errors
              .map((e) => e.message)
              .join(", ")}`
          );
          error.needsPause = true;
          throw error;
        }

        // Validate response structure
        if (
          !submissionsData.data ||
          !submissionsData.data.questionSubmissionList
        ) {
          const error = new Error(
            "Invalid submission list response - API rate limit likely reached"
          );
          error.needsPause = true;
          throw error;
        }

        const submissionList = submissionsData.data.questionSubmissionList;
        allSubmissions = allSubmissions.concat(submissionList.submissions);

        hasNext = submissionList.hasNext;
        lastKey = submissionList.lastKey;
        offset += limit;

        // Add delay between pagination requests
        if (hasNext) {
          await this.sleep(300);
        }
      }

      const submissions = allSubmissions;

      // Filter for accepted submissions only
      const acceptedSubmissions = submissions.filter(
        (sub) => sub.status === 10
      );

      if (acceptedSubmissions.length === 0) {
        return {};
      }

      const submissionsByLang = {};

      // Find the most recent submission per language
      for (const submission of acceptedSubmissions) {
        const lang = submission.lang;
        const timestamp = parseInt(submission.timestamp);

        if (
          !submissionsByLang[lang] ||
          timestamp > submissionsByLang[lang].timestamp
        ) {
          submissionsByLang[lang] = {
            id: submission.id,
            title: submission.title,
            timestamp: timestamp,
            lang: lang,
          };
        }
      }

      const result = {};

      // Fetch detailed code for each language submission
      for (const lang in submissionsByLang) {
        // Longer delay between detail requests to be more respectful
        await this.sleep(800);

        const submissionId = submissionsByLang[lang].id;

        const detailsResponse = await fetch("https://leetcode.com/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            query: `
              query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    runtime
    runtimeDisplay
    runtimePercentile
    runtimeDistribution
    memory
    memoryDisplay
    memoryPercentile
    memoryDistribution
    code
    timestamp
    statusCode
    user {
      username
      profile {
        realName
        userAvatar
      }
    }
    lang {
      name
      verboseName
    }
    question {
      questionId
      titleSlug
      hasFrontendPreview
    }
    notes
    flagType
    topicTags {
      tagId
      slug
      name
    }
    runtimeError
    compileError
    lastTestcase
    codeOutput
    expectedOutput
    totalCorrect
    totalTestcases
    fullCodeOutput
    testDescriptions
    testBodies
    testInfo
    stdOutput
  }
}
            `,
            variables: {
              submissionId: submissionId,
            },
          }),
        });

        // Check HTTP status for rate limiting
        if (!detailsResponse.ok) {
          const error = new Error(`HTTP error: ${detailsResponse.status}`);
          error.needsPause =
            detailsResponse.status === 429 || detailsResponse.status >= 500;
          throw error;
        }

        const detailsData = await detailsResponse.json();

        // Check for GraphQL errors
        if (detailsData.errors) {
          const error = new Error(
            `GraphQL errors: ${detailsData.errors
              .map((e) => e.message)
              .join(", ")}`
          );
          error.needsPause = true;
          throw error;
        }

        // Validate response data structure
        if (!detailsData.data) {
          const error = new Error(
            "Invalid details response - API rate limit likely reached"
          );
          error.needsPause = true;
          throw error;
        }

        const details = detailsData.data.submissionDetails;

        // Check for null details (common rate limit indicator)
        if (!details) {
          const error = new Error(
            "API rate limit reached - null submission details received"
          );
          error.needsPause = true;
          throw error;
        }

        // Skip submissions without code (shouldn't happen for accepted submissions)
        if (!details.code) {
          continue;
        }

        result[lang] = {
          questionId: details.question.questionId,
          title: this.kebabToPascalCase(details.question.titleSlug),
          titleSlug: details.question.titleSlug,
          status_display: "Accepted",
          code: details.code,
          timestamp: details.timestamp,
          lang: lang,
        };
      }

      // Ensure we have at least one valid submission
      if (Object.keys(result).length === 0) {
        return {};
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Utility function to pause execution for rate limiting.
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after the specified delay
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Converts kebab-case strings to PascalCase for consistent naming.
   * Used to transform LeetCode problem slugs into proper class/file names.
   *
   * Example: "two-sum" -> "TwoSum"
   *
   * @param {string} str - Kebab-case string to convert
   * @returns {string} PascalCase converted string
   */
  kebabToPascalCase(str) {
    const words = str.split("-");

    const capitalizedWords = words.map(
      (word) => word.charAt(0).toUpperCase() + word.slice(1)
    );

    return capitalizedWords.join("");
  }
}
