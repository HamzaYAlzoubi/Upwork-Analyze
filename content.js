// content.js - This file contains the logic to interact with the Upwork page.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeJob') {
    try {
      const jobData = extractJobData();
      sendResponse({ jobData: jobData });
    } catch (error) {
      console.error("Upwork Analyze Extension Error:", error);
      sendResponse({ error: `Extraction failed: ${error.message}` });
    }
  }
  return true; // Indicates that the response is sent asynchronously
});

function extractJobData() {
  // Helper function to safely query a single element and return its text
  const getText = (selector, element = document) => {
    const el = element.querySelector(selector);
    return el ? el.innerText.trim() : 'N/A';
  };

  // Helper function to find an element containing specific text
  const findElementByText = (selector, text, element = document) => {
    const elements = element.querySelectorAll(selector);
    return Array.from(elements).find(el => el.innerText.trim().includes(text));
  };

  // --- Data Extraction ---

  const jobTitle = getText('[data-v-73c2c436] h4.mt-0 span');
  const fullJobDescription = getText('[data-test="Description"] p');
  
  const jobTypeElement = findElementByText('[data-v-52956d3e] li .description', 'price') || findElementByText('[data-v-52956d3e] li .description', 'Hourly');
  const jobType = jobTypeElement ? jobTypeElement.innerText.trim() : 'N/A';
  
  const budgetOrRate = getText('[data-v-52956d3e] li:first-child strong');
  
  const jobAge = getText('.posted-on-line span');
  
  let proposalsCount = 'N/A';
  const activityItems = document.querySelectorAll('[data-v-27de751d] .ca-item');
  activityItems.forEach(item => {
    const titleEl = item.querySelector('.title');
    if (titleEl && titleEl.innerText.trim() === 'Proposals:') {
      proposalsCount = getText('.value', item);
    }
  });

  const paymentVerifiedEl = findElementByText('[data-v-8098830c] strong', 'Payment method verified');
  const paymentVerified = paymentVerifiedEl ? 'Yes' : 'No';

  const clientLocation = getText('[data-qa="client-location"] strong');
  const experienceLevel = getText('li:has([data-cy="expertise"]) strong');
  
  const clientJoinDate = getText('[data-qa="client-contract-date"] small');
  
  const jobStatsText = getText('[data-qa="client-job-posting-stats"]');
  const hireRateMatch = jobStatsText.match(/(\d+%)\s+hire rate/);
  const openJobsMatch = jobStatsText.match(/(\d+)\s+open job/);
  const clientHireRate = hireRateMatch ? hireRateMatch[1] : 'N/A';
  const clientJobsPosted = getText('[data-qa="client-job-posting-stats"] strong');
  const openJobs = openJobsMatch ? openJobsMatch[1] : 'N/A';

  const totalSpent = getText('[data-qa="client-spend"] strong span span');
  const clientRatingText = getText('[data-testid="buyer-rating"]');
  const clientRating = clientRatingText.split(' ')[0] || 'N/A';
  const clientReviewsCountMatch = clientRatingText.match(/of (\d+ reviews)/);
  const clientReviewsCount = clientReviewsCountMatch ? clientReviewsCountMatch[1] : 'N/A';

  let invitesSent = 'N/A';
  activityItems.forEach(item => {
    const titleEl = item.querySelector('.title');
    if (titleEl && titleEl.innerText.trim() === 'Invites sent:') {
      invitesSent = getText('.value', item);
    }
  });

  const recentHistoryItems = Array.from(document.querySelectorAll('[data-cy="job"].item'));
  const clientHistory = recentHistoryItems.map(item => {
    const projectTitle = getText('[data-cy="job-title"]', item);
    const freelancerName = getText('a[href*="/freelancers/"]', item);
    
    // Feedback given by the client to the freelancer
    const clientFeedbackElement = item.querySelector('.text-body-sm.mt-2x.mb-2x');
    let clientFeedback = 'No feedback given';
    if (clientFeedbackElement && !clientFeedbackElement.innerText.includes('To freelancer:')) {
        clientFeedback = clientFeedbackElement.innerText.trim();
    }

    // Feedback given by the freelancer to the client
    const freelancerFeedbackElement = findElementByText('.text-body-sm', 'To freelancer:', item);
    let freelancerFeedback = 'N/A';
    if (freelancerFeedbackElement) {
        const feedbackTextElement = freelancerFeedbackElement.querySelector('.air3-truncation span');
        if(feedbackTextElement) {
            freelancerFeedback = feedbackTextElement.innerText.trim();
        }
    }

    return {
      projectTitle,
      freelancerName,
      clientFeedback,
      freelancerFeedback
    };
  });

  return {
    jobTitle,
    fullJobDescription,
    jobType,
    budgetOrRate,
    jobAge,
    proposalsCount,
    paymentVerified,
    clientLocation,
    experienceLevel,
    clientJoinDate,
    clientHireRate,
    clientJobsPosted,
    openJobs,
    totalSpent,
    clientRating,
    clientReviewsCount,
    invitesSent,
    clientHistory
  };
}