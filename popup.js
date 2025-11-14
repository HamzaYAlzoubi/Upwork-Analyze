document.addEventListener('DOMContentLoaded', () => {
  const analysisResultsDiv = document.getElementById('analysis-results');

  // Query the active tab and send a message to the content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Ensure we have a tab and it has a URL
    if (tabs.length === 0 || !tabs[0].url) {
      analysisResultsDiv.innerHTML = '<p class="error">Could not access tab information.</p>';
      return;
    }

    // Check if the tab is an Upwork job page
    if (!tabs[0].url.includes('upwork.com/jobs/')) {
      analysisResultsDiv.innerHTML = '<p class="error">This is not an Upwork job page. Please navigate to a job post to use this extension.</p>';
      return;
    }
    
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['content.js']
    }, () => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'analyzeJob' }, (response) => {
        if (chrome.runtime.lastError) {
          analysisResultsDiv.innerHTML = `<p class="error">Error: ${chrome.runtime.lastError.message}</p>`;
          return;
        }
        if (response && response.jobData) {
          renderJobData(response.jobData);
          setupButtons(response.jobData);
        } else {
          analysisResultsDiv.innerHTML = '<p class="error">Failed to retrieve job data. The page structure might have changed.</p>';
        }
      });
    });
  });

  function renderJobData(data) {
    let historyHtml = data.clientHistory.map(item => `
      <div class="history-item">
        <strong>${item.projectTitle || 'N/A'}</strong>
        <p><em>Feedback to Client:</em> ${item.freelancerFeedback || 'N/A'}</p>
        <p><em>Feedback from Client:</em> ${item.clientFeedback || 'N/A'}</p>
      </div>
    `).join('');

    const paymentVerifiedIcon = `<svg class="verified-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="var(--icon-color, #14a800)" fill-rule="evenodd" vector-effect="non-scaling-stroke" stroke="var(--icon-color, #14a800)" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M20.4 13.1c.8 1 .3 2.5-.9 2.9-.8.2-1.3 1-1.3 1.8 0 1.3-1.2 2.2-2.5 1.8-.8-.3-1.7 0-2.1.7-.7 1.1-2.3 1.1-3 0-.5-.7-1.3-1-2.1-.7-1.4.4-2.6-.6-2.6-1.8 0-.8-.5-1.6-1.3-1.8-1.2-.4-1.7-1.8-.9-2.9.5-.7.5-1.6 0-2.2-.9-1-.4-2.5.9-2.9.8-.2 1.3-1 1.3-1.8C5.9 5 7.1 4 8.3 4.5c.8.3 1.7 0 2.1-.7.7-1.1 2.3-1.1 3 0 .5.7 1.3 1 2.1.7 1.4-.5 2.6.5 2.6 1.7 0 .8.5 1.6 1.3 1.8 1.2.4 1.7 1.8.9 2.9-.4.6-.4 1.6.1 2.2z" clip-rule="evenodd"></path><path vector-effect="non-scaling-stroke" stroke="var(--icon-color-bg, #fff)" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M15.5 9.7L11 14.3l-2.5-2.5"></path></svg>`;
    const paymentNotVerifiedIcon = `<svg class="verified-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="#d93025" fill-rule="evenodd" vector-effect="non-scaling-stroke" stroke="#d93025" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M20.4 13.1c.8 1 .3 2.5-.9 2.9-.8.2-1.3 1-1.3 1.8 0 1.3-1.2 2.2-2.5 1.8-.8-.3-1.7 0-2.1.7-.7 1.1-2.3 1.1-3 0-.5-.7-1.3-1-2.1-.7-1.4.4-2.6-.6-2.6-1.8 0-.8-.5-1.6-1.3-1.8-1.2-.4-1.7-1.8-.9-2.9.5-.7.5-1.6 0-2.2-.9-1-.4-2.5.9-2.9.8-.2 1.3-1 1.3-1.8C5.9 5 7.1 4 8.3 4.5c.8.3 1.7 0 2.1-.7.7-1.1 2.3-1.1 3 0 .5.7 1.3 1 2.1.7 1.4-.5 2.6.5 2.6 1.7 0 .8.5 1.6 1.3 1.8 1.2.4 1.7 1.8.9 2.9-.4.6-.4 1.6.1 2.2z" clip-rule="evenodd"></path><path vector-effect="non-scaling-stroke" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M15 9l-6 6m0-6l6 6"></path></svg>`;
    const proposalsWarningIcon = `<svg class="verified-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="#ffc107" fill-rule="evenodd" vector-effect="non-scaling-stroke" stroke="#ffc107" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M20.4 13.1c.8 1 .3 2.5-.9 2.9-.8.2-1.3 1-1.3 1.8 0 1.3-1.2 2.2-2.5 1.8-.8-.3-1.7 0-2.1.7-.7 1.1-2.3 1.1-3 0-.5-.7-1.3-1-2.1-.7-1.4.4-2.6-.6-2.6-1.8 0-.8-.5-1.6-1.3-1.8-1.2-.4-1.7-1.8-.9-2.9.5-.7.5-1.6 0-2.2-.9-1-.4-2.5.9-2.9.8-.2 1.3-1 1.3-1.8C5.9 5 7.1 4 8.3 4.5c.8.3 1.7 0 2.1-.7.7-1.1 2.3-1.1 3 0 .5.7 1.3 1 2.1.7 1.4-.5 2.6.5 2.6 1.7 0 .8.5 1.6 1.3 1.8 1.2.4 1.7 1.8.9 2.9-.4.6-.4 1.6.1 2.2z" clip-rule="evenodd"></path><path vector-effect="non-scaling-stroke" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="2" d="M12 8v6m0 3v.01"></path></svg>`;

    let proposalsIcon = '';
    if (data.proposalsCount.includes('50+')) {
        proposalsIcon = paymentNotVerifiedIcon;
    } else if (data.proposalsCount.includes('Less than 5')) {
        proposalsIcon = paymentVerifiedIcon;
    } else {
        const match = data.proposalsCount.match(/(\d+)\s*to\s*(\d+)/);
        if (match) {
            const upperLimit = parseInt(match[2]);
            if (upperLimit <= 15) {
                proposalsIcon = paymentVerifiedIcon;
            } else if (upperLimit > 15 && upperLimit <= 50) {
                proposalsIcon = proposalsWarningIcon;
            }
        }
    }

    function generateStars(rating) {
        const totalStars = 5;
        const fullStar = '★';
        const emptyStar = '☆';
        const roundedRating = Math.round(rating);
        let stars = '';
        if (isNaN(roundedRating) || rating === 'N/A') return '';
        for (let i = 0; i < totalStars; i++) {
            stars += i < roundedRating ? fullStar : emptyStar;
        }
        return `<span class="star-rating">${stars}</span>`;
    }

    function parseMoney(moneyString) {
        if (typeof moneyString !== 'string' || moneyString === 'N/A') return 0;
        let num = parseFloat(moneyString.replace(/[^0-9.]/g, ''));
        if (moneyString.toUpperCase().includes('K')) {
            num *= 1000;
        }
        if (moneyString.toUpperCase().includes('M')) {
            num *= 1000000;
        }
        return num;
    }

    const starRating = generateStars(parseFloat(data.clientRating));

    let clientRatingIcon = '';
    if (data.clientRating === 'N/A') {
        clientRatingIcon = paymentNotVerifiedIcon;
    } else {
        const ratingValue = parseFloat(data.clientRating);
        const reviewsCountMatch = data.clientReviewsCount.match(/(\d+)/);
        const reviewsCount = reviewsCountMatch ? parseInt(reviewsCountMatch[1]) : 0;
        if (ratingValue >= 4.5 && reviewsCount >= 3) {
            clientRatingIcon = paymentVerifiedIcon;
        } else if (ratingValue >= 4.1 && ratingValue <= 4.4) {
            clientRatingIcon = proposalsWarningIcon;
        } else if (ratingValue < 4.1) {
            clientRatingIcon = paymentNotVerifiedIcon;
        }
    }

    let totalSpentIcon = '';
    const spentAmount = parseMoney(data.totalSpent);
    if (spentAmount > 5000) {
        totalSpentIcon = paymentVerifiedIcon;
    } else if (data.totalSpent === 'N/A') {
        totalSpentIcon = paymentNotVerifiedIcon;
    }

    let jobsPostedIcon = '';
    const jobsPostedValue = parseInt(data.clientJobsPosted);
    const hireRateValue = parseInt(data.clientHireRate.replace('%', ''));

    if (data.clientJobsPosted === 'N/A') {
        jobsPostedIcon = paymentNotVerifiedIcon;
    } else if (jobsPostedValue > 50 && hireRateValue > 75) {
        jobsPostedIcon = paymentVerifiedIcon;
    } else if (jobsPostedValue <= 5 && hireRateValue < 90) {
        jobsPostedIcon = paymentNotVerifiedIcon;
    }

    // Logic for Hire Rate Icon
    let hireRateIcon = '';
    if (data.clientHireRate === 'N/A') {
        hireRateIcon = paymentNotVerifiedIcon;
    } else {
        const hireRateValue = parseInt(data.clientHireRate.replace('%', ''));
        const jobsPostedValue = parseInt(data.clientJobsPosted); // Correctly use jobs posted

        if (hireRateValue < 60) {
            hireRateIcon = paymentNotVerifiedIcon;
        } else if (hireRateValue >= 60 && hireRateValue <= 85) {
            hireRateIcon = proposalsWarningIcon;
        } else if (hireRateValue > 85) {
            if (jobsPostedValue > 5) { // Check jobs posted, not open jobs
                hireRateIcon = paymentVerifiedIcon;
            } else {
                hireRateIcon = proposalsWarningIcon;
            }
        }
    }

    // Logic for Member Since Icon
    let memberSinceIcon = '';
    if (data.clientJoinDate !== 'N/A') {
        const joinDate = new Date(data.clientJoinDate);
        const currentDate = new Date();

        const diffYears = currentDate.getFullYear() - joinDate.getFullYear();
        const diffMonths = currentDate.getMonth() - joinDate.getMonth();
        const totalMonths = (diffYears * 12) + diffMonths;

        if (totalMonths < 6) {
            memberSinceIcon = paymentNotVerifiedIcon;
        } else if (totalMonths > 24) {
            memberSinceIcon = paymentVerifiedIcon;
        }
    }

    // Logic for Avg Hourly Rate Icon
    let avgRateIcon = '';
    if (data.avgHourlyRate === 'N/A') {
        avgRateIcon = paymentNotVerifiedIcon;
    } else {
        const rateValue = parseFloat(data.avgHourlyRate.replace('$', ''));
        if (rateValue < 10) {
            avgRateIcon = paymentNotVerifiedIcon;
        } else if (rateValue >= 10 && rateValue <= 15) {
            avgRateIcon = proposalsWarningIcon;
        } else if (rateValue > 15) {
            avgRateIcon = paymentVerifiedIcon;
        }
    }

    let jobAgeIcon = '';
    const jobAgeLowerCase = data.jobAge.toLowerCase();
    if (
        jobAgeLowerCase.includes('minute') ||
        jobAgeLowerCase.includes('now') ||
        jobAgeLowerCase.includes('1 hour')
    ) {
        jobAgeIcon = paymentVerifiedIcon;
    }

    analysisResultsDiv.innerHTML = `
      <div class="data-section">
        <h3>Job Details</h3>
        <dl>
          <dt>Title</dt><dd>${data.jobTitle}</dd>
          <dt>Type</dt><dd>${data.jobType}</dd>
          <dt>Budget / Rate</dt><dd>${data.budgetOrRate}</dd>
          <dt>Experience</dt><dd>${data.experienceLevel}</dd>
          <dt>Connects</dt><dd>Required: ${data.requiredConnects} / Available: ${data.availableConnects}</dd>
          <dt class="separator" colspan="2"></dt>
          <dt>Posted</dt><dd>${data.jobAge} ${jobAgeIcon}</dd>
          <dt>Last Viewed</dt><dd>${data.lastViewed}</dd>
          <dt>Proposals</dt><dd>${data.proposalsCount} ${proposalsIcon}</dd>
          <dt>Interviewing</dt><dd>${data.interviewing}</dd>
          <dt>Invites Sent</dt><dd>${data.invitesSent}</dd>
          <dt>Hires</dt><dd>${data.hires} ${parseInt(data.hires) > 0 ? paymentNotVerifiedIcon : ''}</dd>
        </dl>
        <h4>Full Job Description</h4>
        <div class="description-box">
          <p id="full-description">${data.fullJobDescription}</p>
        </div>
      </div>

      <div class="data-section">
        <h3>Client Details</h3>
        <dl>
          <dt>Payment Verified</dt><dd>${data.paymentVerified === 'Yes' ? paymentVerifiedIcon : paymentNotVerifiedIcon} ${data.paymentVerified}</dd>
          <dt>Rating</dt><dd>${starRating} ${data.clientRating} (${data.clientReviewsCount}) ${clientRatingIcon}</dd>
          <dt>Location</dt><dd>${data.clientLocation}</dd>
          <dt>Total Spent</dt><dd>${data.totalSpent} ${totalSpentIcon}</dd>
          <dt>Jobs Posted</dt><dd>${data.clientJobsPosted} ${jobsPostedIcon}</dd>
          <dt>Hire Rate</dt><dd>${data.clientHireRate} (${data.openJobs} open) ${hireRateIcon}</dd>
          <dt>Avg Rate / Hours</dt><dd>${data.avgHourlyRate} / ${data.totalHours} ${avgRateIcon}</dd>
          <dt>Member Since</dt><dd>${data.clientJoinDate} ${memberSinceIcon}</dd>
        </dl>
        <h4>Client Recent History (${data.clientHistory.length})</h4>
        <div class="history-container">
          ${historyHtml || '<p>No recent history found.</p>'}
        </div>
      </div>
    `;
  }

  function setupButtons(data) {
    const copyBtn = document.getElementById('copy-all-btn');
    const downloadBtn = document.getElementById('download-btn');

    const fullText = generateFullText(data);

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(fullText).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy All'; }, 2000);
      });
    });

    downloadBtn.addEventListener('click', () => {
      const blob = new Blob([fullText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.jobTitle.replace(/[^a-z0-9]/gi, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
  
  function generateFullText(data) {
      let historyText = data.clientHistory.map(item => 
`Project: ${item.projectTitle}
  - Feedback to Client: ${item.freelancerFeedback}
  - Feedback from Client: ${item.clientFeedback}`
      ).join('\n\n');

      return `
---
JOB DETAILS ---
Job Title: ${data.jobTitle}
Job Type: ${data.jobType}
Budget / Rate: ${data.budgetOrRate}
Experience Level: ${data.experienceLevel}
Connects: Required ${data.requiredConnects} / Available ${data.availableConnects}
Posted: ${data.jobAge}
Last Viewed: ${data.lastViewed}
Proposals: ${data.proposalsCount}
Interviewing: ${data.interviewing}
Invites Sent: ${data.invitesSent}
Hires: ${data.hires}

---
CLIENT DETAILS ---
Payment Verified: ${data.paymentVerified}
Rating: ${data.clientRating} (${data.clientReviewsCount})
Location: ${data.clientLocation}
Total Spent: ${data.totalSpent}
Avg Hourly Rate: ${data.avgHourlyRate}
Total Hours: ${data.totalHours}
Jobs Posted: ${data.clientJobsPosted}
Hire Rate: ${data.clientHireRate} (${data.openJobs} open)
Member Since: ${data.clientJoinDate}

---
FULL JOB DESCRIPTION ---
${data.fullJobDescription}

---
CLIENT RECENT HISTORY ---
${historyText}
`;
  }

});