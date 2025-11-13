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
  
  let fullJobDescription = 'N/A';
  const descriptionContainer = document.querySelector('[data-test="Description"]');
  if (descriptionContainer) {
      fullJobDescription = descriptionContainer.innerText.trim();
  }
  
  const jobTypeElement = findElementByText('[data-v-52956d3e] li .description', 'price') || findElementByText('[data-v-52956d3e] li .description', 'Hourly');
  const jobType = jobTypeElement ? jobTypeElement.innerText.trim() : 'N/A';
  
  let budgetOrRate = 'N/A';
  const fixedPriceEl = document.querySelector('[data-v-52956d3e] li:has([data-cy="fixed-price"]) strong');
  const hourlyRateEl = document.querySelector('[data-v-52956d3e] li:has([data-cy="clock-timelog"])');

  if (fixedPriceEl) {
      budgetOrRate = fixedPriceEl.innerText.trim();
  } else if (hourlyRateEl) {
      const minRate = getText('div[data-v-801afba5]:first-child strong', hourlyRateEl);
      const maxRate = getText('div[data-v-801afba5]:last-child strong', hourlyRateEl);
      if (minRate !== 'N/A' && maxRate !== 'N/A') {
          budgetOrRate = `${minRate} - ${maxRate}`;
      } else if (minRate !== 'N/A') {
          budgetOrRate = minRate;
      }
  }
  
  let jobAge = 'N/A';
  const postedOnLineEl = document.querySelector('.posted-on-line');
  if (postedOnLineEl && postedOnLineEl.children[0]) {
      jobAge = postedOnLineEl.children[0].innerText.replace('Posted', '').trim();
  }

  const getActivityValue = (activityTitle) => {
    const activityHeader = Array.from(document.querySelectorAll('h5')).find(
        h5 => h5.innerText.trim() === 'Activity on this job'
    );
    if (!activityHeader) return 'N/A';
    const activitySection = activityHeader.closest('section');
    if (!activitySection) return 'N/A';
    const allItems = activitySection.querySelectorAll('.ca-item');
    const targetItem = Array.from(allItems).find(item => {
        const titleEl = item.querySelector('.title');
        return titleEl && titleEl.innerText.trim() === activityTitle;
    });
    if (targetItem) {
        const valueEl = targetItem.querySelector('.value');
        return valueEl ? valueEl.innerText.trim() : 'N/A';
    }
    return 'N/A';
  };

  const proposalsCount = getActivityValue('Proposals:');
  const interviewing = getActivityValue('Interviewing:');
  const invitesSent = getActivityValue('Invites sent:');
  const lastViewed = getActivityValue('Last viewed by client:');
  const hires = getActivityValue('Hires:');

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

  let requiredConnects = 'N/A';
  let availableConnects = 'N/A';
  const connectsContainer = document.querySelector('div.text-light-on-muted[data-v-6d4ec4a7]');
  if (connectsContainer) {
      const requiredLabel = findElementByText('span', 'Required Connects to submit a proposal:', connectsContainer);
      if (requiredLabel && requiredLabel.nextElementSibling) {
          requiredConnects = requiredLabel.nextElementSibling.innerText.trim();
      }
      const availableDiv = findElementByText('div.mt-2', 'Available Connects:', connectsContainer);
      if (availableDiv) {
          availableConnects = availableDiv.innerText.replace('Available Connects:', '').trim();
      }
  }

  const recentHistoryItems = Array.from(document.querySelectorAll('[data-cy="job"].item'));
  const clientHistory = recentHistoryItems.map(item => {
    const projectTitle = getText('[data-cy="job-title"]', item);
    const freelancerName = getText('a[href*="/freelancers/"]', item);
    
    const clientFeedbackElement = item.querySelector('.text-body-sm.mt-2x.mb-2x');
    let clientFeedback = 'No feedback given';
    if (clientFeedbackElement && !clientFeedbackElement.innerText.includes('To freelancer:')) {
        clientFeedback = clientFeedbackElement.innerText.trim();
    }

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
    lastViewed,
    proposalsCount,
    interviewing,
    invitesSent,
    hires,
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
    requiredConnects,
    availableConnects,
    clientHistory
  };
}
