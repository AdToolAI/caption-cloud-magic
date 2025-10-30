export type Language = 'en' | 'de' | 'es';

export interface Translation {
  [key: string]: string | Translation;
}

export interface Translations {
  [language: string]: Translation;
}

export const translations: Record<Language, any> = {
  en: {
    // Feature Guides
    featureGuides: {
      common: {
        whatIsIt: "What is this?",
        setupTitle: "How to set it up",
        proTip: "Pro Tip",
        viewDocs: "View Documentation"
      },
      automation: {
        icon: "📅",
        title: "Post Automation",
        description: "Plan your entire month in advance – posts are automatically published at the best time",
        whatIsIt: "What is Post Automation?",
        whatDescription: "The Smart Calendar lets you schedule all your social media posts weeks or months in advance. Set it and forget it – your content gets published automatically while you focus on creating.",
        setupTitle: "Setup in 5 steps",
        step1: {
          title: "Open Calendar",
          description: "Navigate to the Smart Calendar via the sidebar",
          actionLabel: "Go to Calendar",
          actionLink: "/calendar"
        },
        step2: {
          title: "Create First Post",
          description: "Click on '+ Add Post' or use the Quick-Add form. Select your platform (Instagram, TikTok, LinkedIn, etc.)"
        },
        step3: {
          title: "Add Content",
          description: "Enter your caption or generate it with AI. Upload media (image/video)"
        },
        step4: {
          title: "Set Publish Time",
          description: "Choose a date or use 'Smart Scheduler' for optimal posting times. Status automatically set to 'Scheduled'"
        },
        step5: {
          title: "Automatic Publishing",
          description: "Your post will be automatically published at the scheduled time. Real-time updates in the status overview"
        },
        proTip: "Use the Auto-Schedule feature to let AI find the best times for maximum engagement based on your audience's behavior.",
        quickStartLabel: "Go to Calendar",
        quickStartLink: "/calendar",
        docsLink: "/docs/calendar"
      },
      analytics: {
        icon: "📊",
        title: "Performance Analytics",
        description: "Understand what works with detailed insights – optimize your strategy based on data",
        whatIsIt: "What is Performance Analytics?",
        whatDescription: "Connect your social media accounts and get deep insights into what content performs best. Track engagement, reach, and growth across all platforms in one dashboard.",
        setupTitle: "Setup in 5 steps",
        step1: {
          title: "Open Performance Tracker",
          description: "Navigate to Performance Tracker in the sidebar",
          actionLabel: "Go to Performance",
          actionLink: "/performance"
        },
        step2: {
          title: "Connect Accounts",
          description: "Go to 'Connections' tab. Click 'Connect' for Instagram, TikTok, LinkedIn, X, etc. Authorize the app (OAuth flow)"
        },
        step3: {
          title: "First Sync",
          description: "Click 'Sync Now' to import your posts. This may take a minute depending on the number of posts"
        },
        step4: {
          title: "View Dashboard",
          description: "Switch to 'Overview' tab. See engagement rate, reach, top posts, and growth trends"
        },
        step5: {
          title: "Generate AI Insights",
          description: "Go to 'Caption Insights' tab. Click 'Start AI Analysis' to get concrete improvement suggestions"
        },
        proTip: "Sync your posts regularly (weekly) to track trends over time and spot patterns in your best-performing content.",
        quickStartLabel: "Go to Performance Tracker",
        quickStartLink: "/performance",
        docsLink: "/docs/performance"
      },
      brandKit: {
        icon: "🎨",
        title: "Brand Kit & Consistency",
        description: "Keep your brand identity consistent across all platforms and posts",
        whatIsIt: "What is Brand Kit?",
        whatDescription: "Define your brand voice, values, and visual identity once – then every AI-generated post automatically matches your unique style. No more inconsistent messaging.",
        setupTitle: "Setup in 5 steps",
        step1: {
          title: "Create Brand Kit",
          description: "Navigate to Brand Kit in the sidebar. Use the onboarding wizard for guidance",
          actionLabel: "Go to Brand Kit",
          actionLink: "/brand-kit"
        },
        step2: {
          title: "Enter Basic Info",
          description: "Define brand name, target audience, and core values"
        },
        step3: {
          title: "Analyze Brand Voice",
          description: "Paste 3-5 example captions that represent your style. Click 'Analyze Voice' and AI creates your brand profile"
        },
        step4: {
          title: "Upload Logo (Optional)",
          description: "Upload your logo for automatic color palette extraction and visual consistency"
        },
        step5: {
          title: "Activate Brand Kit",
          description: "All generated posts now use your brand voice automatically. Consistency score is tracked"
        },
        proTip: "Update your Brand Kit quarterly as your brand evolves. The AI learns from your most recent posts to stay current.",
        quickStartLabel: "Create Brand Kit",
        quickStartLink: "/brand-kit"
      },
      coach: {
        icon: "🤖",
        title: "AI Content Coach",
        description: "Get real-time feedback on captions, hashtags, and posting times – like a personal social media manager",
        whatIsIt: "What is AI Content Coach?",
        whatDescription: "Your 24/7 social media strategist. Ask questions, get content reviews, learn best practices, and receive personalized advice based on your performance data.",
        setupTitle: "Setup in 5 steps",
        step1: {
          title: "Open Coach",
          description: "Navigate to AI Coach in the sidebar",
          actionLabel: "Go to Coach",
          actionLink: "/coach"
        },
        step2: {
          title: "Link Brand Kit (Recommended)",
          description: "Select your active Brand Kit for personalized recommendations aligned with your voice"
        },
        step3: {
          title: "Ask First Question",
          description: "Try: 'How can I write better Instagram captions?' Coach analyzes your past posts for context"
        },
        step4: {
          title: "Request Content Review",
          description: "Paste a caption for real-time feedback on tone, hashtags, CTA, and engagement potential"
        },
        step5: {
          title: "Enable Weekly Reports (Optional)",
          description: "Activate in Settings → Notifications to receive weekly performance summaries and tips"
        },
        proTip: "Use the Coach before publishing! Paste your draft caption and ask 'Will this perform well?' for predictive insights.",
        quickStartLabel: "Chat with Coach",
        quickStartLink: "/coach"
      },
      publishing: {
        icon: "⚡",
        title: "Multi-Platform Publishing",
        description: "Publish simultaneously on Instagram, TikTok, LinkedIn, X, and YouTube – with one click",
        whatIsIt: "What is Multi-Platform Publishing?",
        whatDescription: "Create once, publish everywhere. The Composer shows platform-specific previews in real-time and adapts your content (caption length, hashtags, format) for each network.",
        setupTitle: "Setup in 5 steps",
        step1: {
          title: "Open Composer",
          description: "Navigate to Composer in the sidebar",
          actionLabel: "Go to Composer",
          actionLink: "/composer"
        },
        step2: {
          title: "Select Platforms",
          description: "Choose Instagram, TikTok, LinkedIn, X, YouTube Shorts. See platform-specific preview in real-time"
        },
        step3: {
          title: "Create Content",
          description: "Write your caption or generate it with AI. Upload media (image/video)"
        },
        step4: {
          title: "Platform-Specific Adjustments",
          description: "Adapt caption length for X. Hashtag suggestions for Instagram. Video format check for TikTok/Shorts"
        },
        step5: {
          title: "Publish or Schedule",
          description: "Click 'Publish Now' for instant posting or 'Schedule' to add to calendar"
        },
        proTip: "Use the platform-specific preview to ensure your video looks perfect on each platform before publishing.",
        quickStartLabel: "Create New Post",
        quickStartLink: "/composer"
      },
      goals: {
        icon: "📈",
        title: "Goal Tracking & Achievements",
        description: "Set content goals, track progress, and reach milestones with motivating achievements",
        whatIsIt: "What is Goal Tracking?",
        whatDescription: "Set SMART goals (followers, posts per month, engagement rate, revenue) and track progress automatically. Unlock achievements and stay motivated with gamification.",
        setupTitle: "Setup in 5 steps",
        step1: {
          title: "Open Goals Dashboard",
          description: "Navigate to Goals Dashboard in the sidebar",
          actionLabel: "Go to Goals",
          actionLink: "/goals-dashboard"
        },
        step2: {
          title: "Create First Goal",
          description: "Click '+ New Goal'. Choose goal type (e.g., '10,000 followers by December')"
        },
        step3: {
          title: "Define Metrics",
          description: "Set start value, target value, and deadline. Select platform (Instagram, TikTok, etc.)"
        },
        step4: {
          title: "Track Progress",
          description: "System tracks automatically via Performance Tracker. Manual updates possible via 'Update Progress'"
        },
        step5: {
          title: "Unlock Achievements",
          description: "Reach milestones to earn badges. Share your successes on social media"
        },
        proTip: "Set realistic quarterly goals instead of yearly ones. Smaller wins keep you motivated and let you adjust strategy faster.",
        quickStartLabel: "Set First Goal",
        quickStartLink: "/goals-dashboard"
      }
    },
    
    // Goals Dashboard
    goals: {
      title: "Goals Dashboard",
      subtitle: "Set and track your social media goals",
      activeGoals: "Active Goals",
      completed: "Completed Goals",
      avgProgress: "Average Progress",
      addGoal: "Add New Goal",
      createNewGoal: "Create New Goal",
      createGoal: "Create Goal",
      active: "Active",
      completedTab: "Completed",
      noActiveGoals: "No active goals yet. Start by creating your first goal!",
      noCompletedGoals: "No completed goals yet. Keep working towards your targets!",
      motivationBanner: "Keep going – small steps lead to great success!",
      platform: "Platform",
      goalType: "Goal Type",
      targetValue: "Target Value",
      updateValue: "Update value",
      endDate: "End Date",
      optional: "optional",
      deadline: "Deadline",
      success: "Success",
      error: "Error",
      goalCreated: "Goal created successfully",
      goalDeleted: "Goal deleted successfully",
      goalCompleted: "🎉 Goal Completed!",
      congratulations: "Great job! You've reached your target!",
      loadError: "Failed to load goals",
      createError: "Failed to create goal",
      deleteError: "Failed to delete goal",
      fillAllFields: "Please fill in all required fields",
      limitReached: "Goal Limit Reached",
      upgradeForMore: "Upgrade to Pro to create unlimited goals",
      aiInsight: "AI Insight",
      saving: "Saving...",
      save: "Save",
      types: {
        followers: "Followers",
        postsPerMonth: "Posts per Month",
        engagementRate: "Engagement Rate",
        contentCreated: "Content Created",
        revenue: "Revenue"
      },
      filters: {
        timeframe: "Timeframe",
        platform: "Platform",
        all: "All Platforms",
        "7days": "7 Days",
        "30days": "30 Days",
        "90days": "90 Days"
      },
      kpi: {
        totalViews: "Total Views",
        totalLikes: "Total Likes",
        totalComments: "Total Comments",
        avgEngagement: "Avg. Engagement"
      },
      metrics: {
        title: "Content Performance",
        addMetrics: "Add Metrics",
        content: "Content",
        views: "Views",
        likes: "Likes",
        comments: "Comments",
        shares: "Shares",
        engagementRate: "Engagement Rate",
        caption: "Caption",
        captionPlaceholder: "Post title or description...",
        captionRequired: "Caption is required",
        postedAt: "Posted Date",
        saved: "Metrics saved successfully",
        saveError: "Failed to save metrics",
        noData: "No data yet. Add your first post metrics!"
      },
      charts: {
        engagementTrend: "Engagement Trend",
        platformComparison: "Platform Comparison",
        engagementRate: "Engagement Rate",
        posts: "Posts",
        avgEngagement: "Avg. Engagement (%)"
      },
      trends: {
        title: "Performance Trends",
        engagement: "Engagement Change",
        bestTimes: "Best Posting Times"
      },
      recommendations: {
        title: "AI Recommendations",
        noData: "Not enough data for recommendations yet",
        addMoreData: "Add more posts to get personalized insights"
      },
      quickWins: {
        title: "Quick Wins"
      },
      achievements: {
        title: "Achievements",
        consistencyStreak: "Consistency Streak",
        monthlyPosts: "Monthly Posts",
        engagementHero: "Engagement Hero",
        goalCompleter: "Goal Completer",
        days: "days",
        posts: "posts",
        completed: "completed",
        unlocked: "Unlocked ✓",
        locked: "Locked",
        earned: "Earned",
        motivationText: "Keep creating and reaching your goals to unlock more achievements!"
      }
    },
    
    // Comments
    comments: {
      replySuggestions: "Reply Suggestions",
      replySuggestionsGenerated: "Reply suggestions generated",
      replySuggestionsDesc: "Choose the style that fits best",
      replySuggestionsFailed: "Failed to generate suggestions",
      generateReplies: "AI Reply Suggestions",
      generateRepliesButton: "Generate Replies",
      regenerateReplies: "Regenerate Suggestions",
      copyReply: "Copy reply",
      copiedToClipboard: "Copied to clipboard",
      replyTypeFriendly: "Friendly",
      replyTypePromo: "Promotional",
      replyTypeCasual: "Casual"
    },
    
    // Onboarding
    onboarding: {
      welcome: {
        title: "Welcome to AdTool AI!",
        description: "Your dashboard shows all activities and insights at a glance"
      },
      features: {
        title: "Explore Features",
        description: "Browse through our AI-powered tools organized by category"
      },
      generator: {
        title: "Create Your First Caption",
        description: "Start with our AI Caption Generator – your most-used tool"
      },
      performance: {
        title: "Track Your Success",
        description: "Monitor your post performance and get AI insights"
      },
      back: "Back",
      next: "Next",
      finish: "Get Started",
      modal: {
        title: "Welcome to AdTool AI!",
        subtitle: "Your AI-powered Social Media Management Platform",
        feature1: {
          title: "AI Content Creation",
          description: "Generate captions, hooks, and scripts instantly"
        },
        feature2: {
          title: "Performance Analytics",
          description: "Track and optimize your social media success"
        },
        feature3: {
          title: "Smart Scheduling",
          description: "Plan and organize your content calendar"
        },
        feature4: {
          title: "Brand Consistency",
          description: "Maintain your unique voice across all platforms"
        },
        skip: "Skip Tour",
        startTour: "Take a Quick Tour"
      }
    },
    
    // Command Palette
    commandPalette: {
      placeholder: "Search for features...",
      noResults: "No results found"
    },
    
    // Calendar (Enterprise)
    calendar: {
      // Scope Switcher
      workspace: "Workspace",
      client: "Client",
      brand: "Brand",
      selectWorkspace: "Select Workspace",
      selectClient: "Select Client",
      selectBrand: "Select Brand",
      allClients: "All Clients",
      allBrands: "All Brands",
      
      // Views
      views: {
        month: "Month",
        week: "Week",
        list: "List",
        kanban: "Kanban",
        timeline: "Timeline"
      },
      
      // Status
      status: {
        briefing: "Briefing",
        in_progress: "In Progress",
        review: "Review",
        pending_approval: "Pending Approval",
        approved: "Approved",
        scheduled: "Scheduled",
        published: "Published",
        cancelled: "Cancelled"
      },
      
      // Actions
      actions: {
        createEvent: "Create Post",
        addNote: "Add Note",
        autoSchedule: "Auto-Schedule",
        manageIntegrations: "Manage Integrations",
        sendForApproval: "Send for Approval",
        duplicate: "Duplicate",
        exportPDF: "Export PDF",
        exportCSV: "Export CSV",
        exportICS: "Export ICS",
        filter: "Filter",
        share: "Share",
        settings: "Settings",
        bulkEdit: "Bulk Edit",
        bulkDelete: "Bulk Delete",
        bulkMove: "Bulk Move",
        bulkChangeStatus: "Bulk Change Status",
        clearSelection: "Clear Selection"
      },
      
      // Integrations
      integrations: {
        title: "Calendar Integrations",
        googleCalendar: "Google Calendar",
        slack: "Slack Notifications",
        discord: "Discord Notifications",
        notifications: "Notifications"
      },
      
      // Event Card / Drawer
      event: {
        title: "Title",
        channels: "Channels",
        status: "Status",
        publishTime: "Publish Time",
        timezone: "Timezone",
        owner: "Owner",
        assignees: "Assignees",
        campaign: "Campaign",
        tags: "Tags",
        brief: "Brief",
        assets: "Assets",
        hashtags: "Hashtags",
        versions: "Versions",
        comments: "Comments",
        tasks: "Tasks",
        approval: "Approval",
        created: "Created",
        updated: "Updated",
        publishedAt: "Published at",
        noTitle: "Untitled"
      },
      
      // Capacity Planning
      capacity: {
        available: "Available",
        planned: "Planned",
        overbooked: "Overbooked",
        hours: "hours",
        warning: "Capacity Warning",
        teamUtilization: "Team Utilization",
        weeklyCapacity: "Weekly Capacity"
      },
      
      // Filters
      filters: {
        all: "All",
        channel: "Channel",
        status: "Status",
        campaign: "Campaign",
        owner: "Owner",
        dateRange: "Date Range",
        clearAll: "Clear All"
      },
      
      // Messages & Toasts
      messages: {
        eventCreated: "Event created successfully",
        eventUpdated: "Event updated successfully",
        eventDeleted: "Event deleted successfully",
        eventMoved: "Event rescheduled",
        approvalSent: "Sent for approval",
        approvalApproved: "Approved successfully",
        approvalRejected: "Changes requested",
        capacityExceeded: "Team capacity exceeded",
        blackoutDate: "This date is blocked",
      },
      
      // Auto-Schedule
      autoSchedule: {
        title: "AI Auto-Schedule",
        subtitle: "Let AI find the best times for your content",
        selectEvents: "Select Events",
        noEvents: "No events selected",
        generate: "Generate Schedule",
        generating: "Analyzing best times...",
        apply: "Apply Suggestions",
        score: "Quality Score",
        suggestions: "Schedule Suggestions",
        noSuggestions: "No suggestions available",
        success: "Events scheduled successfully",
        error: "Failed to generate schedule",
        reasons: {
          best_time: "Optimal posting time",
          high_engagement: "High engagement window",
          low_competition: "Low competition slot",
          audience_active: "Audience most active"
        }
      },
      
      // Campaign Templates
      templates: {
        title: "Campaign Templates",
        subtitle: "Generate campaigns from pre-built templates",
        select: "Select Template",
        campaignName: "Campaign Name",
        startDate: "Start Date",
        generate: "Generate Campaign",
        generating: "Creating campaign...",
        preview: "Preview",
        duration: "Duration",
        postsCount: "Posts",
        success: "Campaign generated successfully",
        error: "Failed to generate campaign",
        types: {
          launch: "Product Launch",
          sale: "Sales Campaign",
          season: "Seasonal Content",
          always_on: "Always-On Content"
        }
      },
      
      // Blackout Dates
      blackout: {
        title: "Blackout Dates",
        subtitle: "Block dates when posting is not allowed",
        addDate: "Add Blackout Date",
        date: "Date",
        allDay: "All Day",
        startTime: "Start Time",
        endTime: "End Time",
        reason: "Reason",
        note: "Note",
        save: "Save",
        success: "Blackout date added",
        error: "Failed to add blackout date",
        reasons: {
          holiday: "Public Holiday",
          maintenance: "System Maintenance",
          event: "Special Event",
          other: "Other"
        }
      },
      
      // Holiday Suggestions
      holidays: {
        title: "Holiday Content Ideas",
        subtitle: "Get AI-powered content ideas for upcoming holidays",
        selectMonth: "Select Month",
        selectRegion: "Region",
        generate: "Get Ideas",
        generating: "Analyzing holidays...",
        createEvent: "Create Event",
        noHolidays: "No holidays found for this period",
        success: "Holiday suggestions loaded",
        error: "Failed to fetch holidays",
        contentIdeas: "Content Ideas",
        regions: {
          de: "Germany",
          en: "United Kingdom",
          es: "Spain"
        }
      },
      
      // API Messages
      api: {
        success: {
          scheduled: "Posts scheduled successfully",
          campaignGenerated: "Campaign generated successfully",
          blackoutAdded: "Blackout date added",
          holidaysFetched: "Holiday ideas generated"
        },
        errors: {
          NO_DRAFTS_AVAILABLE: "No draft posts available to schedule",
          INTERNAL_ERROR: "An error occurred. Please try again.",
          UNAUTHORIZED: "You don't have permission to perform this action",
          CAPACITY_EXCEEDED: "Team capacity exceeded for this period",
          BLACKOUT_CONFLICT: "This time conflicts with a blackout date"
        },
        timeQuality: {
          high: "Excellent time slot",
          medium: "Good time slot",
          low: "Acceptable time slot",
          PRIME_TIME: "Optimal engagement time",
          GOOD_TIME: "Good posting time",
          AVOIDING_CONFLICT: "Conflict avoided",
          BLACKOUT_AVOIDED: "Blackout bypassed"
        }
      },
      
      // Export options
      export: {
        csv: "CSV Export",
        pdf: "PDF Export",
        ics: "ICS Calendar Export",
        metrics: "Metrics CSV"
      },
      
      // Additional messages
      copySuccess: "Link copied to clipboard",
      exportSuccess: "Export successful",
      loadFailed: "Failed to load events",
      moveFailed: "Failed to move event",
      statusFailed: "Failed to update status",
      statusUpdated: "Status updated",
      noEventsToExport: "No events to export",
      pdfPrintDialog: "Opening print dialog for PDF export...",
      saving: "Saving...",
      createEventComingSoon: "Create event feature coming soon",
      addNoteComingSoon: "Add note feature coming soon",
      filterComingSoon: "Filter feature coming soon",
      shareComingSoon: "Share feature coming soon",
      workspaceCreated: "Workspace created successfully",
      defaultWorkspace: "My Workspace",
      
      // Empty States
      empty: {
        noEvents: "No events yet",
        noEventsDesc: "Create your first event to get started",
        noWorkspace: "No workspace selected",
        noWorkspaceDesc: "Please select a workspace to continue",
        noResults: "No results found",
        noResultsDesc: "Try adjusting your filters",
        workspaceRequired: "Workspace Required",
        workspaceRequiredDesc: "The Content Calendar organizes your posts in workspaces. Create a workspace to get started.",
        createWorkspace: "Create Workspace",
        workspaceInfo: "Workspaces enable team collaboration and organize your content planning"
      },
      
      // Tasks
      tasks: {
        title: "Tasks",
        createTask: "Create Task",
        taskTitle: "Task Title",
        description: "Description",
        priorityLabel: "Priority",
        dueDate: "Due Date",
        assignTo: "Assign To",
        status: {
          todo: "To Do",
          in_progress: "In Progress",
          done: "Done",
          cancelled: "Cancelled"
        },
        priority: {
          low: "Low",
          medium: "Medium",
          high: "High"
        }
      },
      
      // Approval / Review
      approval: {
        title: "Approval",
        sendForReview: "Send for Review",
        reviewLink: "Review Link",
        createReviewLink: "Create Review Link",
        copyLink: "Copy Link",
        approverEmail: "Approver Email",
        message: "Message",
        approve: "Approve",
        requestChanges: "Request Changes",
        comment: "Comment",
        reviewExpires: "Link expires",
        pending: "Pending",
        approved: "Approved",
        changesRequested: "Changes Requested"
      },
      
      // Campaigns
      campaigns: {
        title: "Campaigns",
        createCampaign: "Create Campaign",
        selectTemplate: "Select Template",
        generateFromTemplate: "Generate from Template",
        noCampaign: "No Campaign"
      },
      
      // Create Event Dialog
      create: {
        title: "Create Event",
        stepBasics: "Basics",
        stepPlanning: "Planning",
        stepContent: "Content",
        stepTeam: "Team",
        eventTitle: "Title",
        eventBrief: "Brief",
        selectClient: "Select Client",
        selectBrand: "Select Brand",
        selectCampaign: "Select Campaign",
        selectStatus: "Select Status",
        selectChannels: "Select Channels",
        startDateTime: "Start Time",
        endDateTime: "End Time (optional)",
        timezone: "Timezone",
        caption: "Caption",
        hashtags: "Hashtags",
        tags: "Tags",
        selectOwner: "Owner",
        selectAssignees: "Assignees",
        estimatedMinutes: "Estimated Minutes",
        back: "Back",
        next: "Next",
        saveAsDraft: "Save as Draft",
        createEvent: "Create Event",
        titleRequired: "Title is required",
        channelRequired: "Select at least 1 channel",
        eventCreated: "Event created",
        eventCreationFailed: "Event creation failed"
      },
      
      // Timeline View
      timeline: {
        campaigns: "Campaigns",
        noCampaign: "No Campaign",
        noPosts: "No posts for this month"
      },
      
      // Modal: Add Post
      addPost: {
        title: "Add Post",
        editPost: "Edit Post",
        platform: "Platform",
        caption: "Caption",
        captionPlaceholder: "Write your caption here...",
        status: "Status",
        scheduleDate: "Schedule Date",
        time: "Time",
        pickDate: "Pick a date",
        tags: "Tags (Optional)",
        tagsPlaceholder: "#marketing, #socialmedia",
        suggestedTime: "Suggested best time for",
        delete: "Delete",
        cancel: "Cancel",
        save: "Save",
        saving: "Saving...",
        captionRequired: "Caption is required",
        captionTooLong: "Caption exceeds {limit} character limit for {platform}",
        postCreated: "Post created",
        postUpdated: "Post updated",
        postDeleted: "Post deleted",
        saveFailed: "Failed to save post",
        deleteFailed: "Failed to delete post",
        draft: "Draft",
        scheduled: "Scheduled",
        posted: "Posted"
      },
      
      // Modal: Add Note
      addNote: {
        title: "Add Note",
        date: "Date",
        noDateSelected: "No date selected",
        noteText: "Note",
        notePlaceholder: "e.g., Shoot video for Monday post",
        cancel: "Cancel",
        save: "Save",
        saving: "Saving...",
        noteRequired: "Note text is required",
        dateRequired: "Please select a date",
        noteCreated: "Note created",
        saveFailed: "Failed to save note"
      },
      
      // Event Drawer
      drawer: {
        eventDetails: "Event Details",
        details: "Details",
        tasks: "Tasks",
        comments: "Comments",
        approval: "Approval",
        briefPlaceholder: "Content brief, objectives, target audience...",
        captionPlaceholder: "Post caption...",
        scheduledTime: "Scheduled Time",
        notScheduled: "Not scheduled",
        duplicate: "Duplicate",
        requestApproval: "Request Approval",
        delete: "Delete",
        updateFailed: "Failed to update event",
        eventUpdated: "Event updated",
        duplicateFailed: "Failed to duplicate event",
        eventDuplicated: "Event duplicated",
        deleteFailed: "Failed to delete event",
        eventDeleted: "Event deleted",
        loadFailed: "Failed to load event",
        approvalDesc: "Send this event for approval by creating a review link.",
        createApprovalRequest: "Create Approval Request"
      },
      
      // Duplicate definitions removed - see lines 304-367 for complete definitions
      
      
      // Comments
      comments: {
        title: "Comments",
        addComment: "Add Comment",
        reply: "Reply",
        mentionUser: "Mention User (@)",
        noComments: "No comments yet"
      },
      
      // Toolbar
      toolbar: {
        today: "Today",
        previousMonth: "Previous Month",
        nextMonth: "Next Month",
        previousWeek: "Previous Week",
        nextWeek: "Next Week"
      },
      
      // Mobile
      mobile: {
        viewSelector: "View",
        moreActions: "More Actions",
        events: "Events"
      },
      
      // Duplicate API definitions removed - see lines 388-408 for complete definitions
      apiDuplicate: {
        errors: {
          UNAUTHORIZED: "Unauthorized",
          MISSING_REQUIRED_FIELDS: "Missing required fields",
          TEMPLATE_NOT_FOUND: "Template not found",
          NO_DRAFTS_AVAILABLE: "No drafts available",
          NO_POSTS_IN_RANGE: "No posts in range",
          POST_NOT_FOUND: "Post not found",
          SCHEDULE_CONFLICT: "Schedule conflict",
          CAPACITY_EXCEEDED: "Capacity exceeded",
          GENERATION_FAILED: "Generation failed",
          EXPORT_FAILED: "Export failed",
          INTERNAL_ERROR: "Internal error"
        },
        success: {
          POSTS_SCHEDULED: "{count} posts scheduled",
          SCHEDULE_APPLIED: "Schedule applied",
          CAMPAIGN_CREATED: "Campaign created with {count} events",
          EVENT_RESCHEDULED: "Event rescheduled",
          EXPORT_READY: "Export ready"
        },
        timeQuality: {
          BEST_TIME: "Best time",
          GOOD_TIME: "Good time"
        }
      }
    },
    
    // Analytics
    analytics: {
      unified: {
        title: "Analytics Dashboard",
        subtitle: "Comprehensive insights across all platforms",
        tabs: {
          overview: "Overview",
          performance: "Performance",
          topContent: "Top Content",
          hashtags: "Hashtags",
          campaigns: "Campaigns",
          reports: "Reports"
        }
      },
      totalContent: "Total Content Created",
      totalContentDesc: "Posts and hooks generated",
      thisWeek: "This Week",
      vsLastWeek: "vs last week",
      goalsAchieved: "Goals Achieved",
      goalsAchievedDesc: "Completed milestones",
      streak: "Active Streak",
      days: "days",
      streakDesc: "Keep it going!",
      performanceInsight: "Performance Insight",
      engagementRateMessage: "Your posts are averaging {rate}% engagement on {platform}. Great work!",
      title: "Advanced Analytics",
      subtitle: "Deep insights into your content performance",
      hashtags: "Hashtag Analytics",
      bestContent: "Best Content",
      roi: "Campaign ROI",
      reports: "Reports",
      scheduled: "Scheduled",
      hashtagPerformance: "Hashtag Performance",
      hashtagDescription: "Track which hashtags drive the most engagement",
      analyzeNow: "Analyze Now",
      posts: "posts",
      reach: "reach",
      engagement: "engagement",
      topPerformingContent: "Top Performing Content",
      bestContentDescription: "Your most successful posts based on engagement",
      identifyBest: "Identify Best",
      score: "score",
      campaignROI: "Campaign ROI Tracking",
      roiDescription: "Monitor return on investment for your campaigns",
      noCampaigns: "No campaigns tracked yet",
      ongoing: "Ongoing",
      hashtagAnalysisComplete: "Hashtag Analysis Complete",
      hashtagsAnalyzed: "hashtags analyzed",
      analysisComplete: "Analysis Complete",
      postsAnalyzed: "posts analyzed",
      reportBuilder: "Report Builder",
      builderDescription: "Create custom analytics reports",
      createTemplate: "Create Template",
      newTemplate: "New Report Template",
      templateDescription: "Configure your custom report template",
      templateName: "Template Name",
      templateNamePlaceholder: "e.g., Monthly Performance Report",
      description: "Description",
      descriptionPlaceholder: "Describe what this report includes",
      dateRange: "Date Range",
      last7Days: "Last 7 Days",
      last30Days: "Last 30 Days",
      last90Days: "Last 90 Days",
      platforms: "Platforms",
      sections: "Sections",
      metrics: "Metrics",
      includeLogo: "Include Logo",
      templateCreated: "Template created",
      templateCreatedDescription: "Your report template is ready to use",
      generatingReport: "Generating report",
      pleaseWait: "Please wait...",
      reportGenerated: "Report generated",
      reportReady: "Your report is ready to download",
      generatePDF: "Generate PDF",
      generateCSV: "Export CSV",
      scheduledReports: "Scheduled Reports",
      scheduledDescription: "Automate report delivery via email",
      scheduleNew: "Schedule New",
      newSchedule: "New Report Schedule",
      scheduleFormDescription: "Configure automatic report delivery",
      scheduleName: "Schedule Name",
      scheduleNamePlaceholder: "e.g., Weekly Team Report",
      template: "Template",
      selectTemplate: "Select a template",
      frequency: "Frequency",
      daily: "Daily",
      weekly: "Weekly",
      monthly: "Monthly",
      recipients: "Recipients",
      recipientsHelp: "Separate multiple emails with commas",
      firstSendDate: "First Send Date",
      schedule: "Schedule",
      scheduleCreated: "Schedule created",
      scheduleCreatedDescription: "Reports will be sent automatically",
      scheduleUpdated: "Schedule updated",
      statusUpdated: "Status updated successfully",
      scheduleDeleted: "Schedule deleted",
      scheduleDeletedDescription: "Automatic reports cancelled",
      nextSend: "Next send",
      lastSent: "Last sent",
      active: "Active",
      paused: "Paused"
    },
    
    scheduler: {
      title: "Smart Scheduler",
      subtitle: "Automate recurring posts and batch scheduling",
      createRecurring: "Create Recurring Post",
      newRecurringPost: "New Recurring Post",
      formDescription: "Set up a post that will be published automatically on a schedule",
      titlePlaceholder: "e.g., Monday Motivation",
      caption: "Caption",
      captionPlaceholder: "Write your post caption...",
      platform: "Platform",
      frequency: "Frequency",
      daily: "Daily",
      weekly: "Weekly",
      biweekly: "Every 2 Weeks",
      monthly: "Monthly",
      firstPostTime: "First Post Time",
      create: "Create Recurring Post",
      active: "Active",
      paused: "Paused",
      lastPosted: "Last posted",
      postCreated: "Recurring Post Created",
      postCreatedDescription: "Your post will be published automatically",
      updated: "Updated",
      statusUpdated: "Post status updated",
      deleted: "Deleted",
      postDeleted: "Recurring post deleted",
      recurringPosts: "Recurring Posts",
      postQueue: "Post Queue",
      queueDescription: "Manage your scheduled posts",
      noQueuedPosts: "No queued posts",
      queueItemDeleted: "Queue item deleted",
      queueItemDeletedDescription: "The post was removed from queue",
      retry: "Retry",
      retryScheduled: "Retry scheduled",
      retryScheduledDescription: "The failed post will be retried",
      status: {
        pending: "Pending",
        completed: "Completed",
        failed: "Failed"
      }
    },
    
    mediaLibrary: {
      title: "Media Library",
      subtitle: "Manage all your content assets in one place",
      upload: "Upload File",
      uploadSuccess: "File uploaded successfully",
      deleteSuccess: "File deleted successfully",
      searchPlaceholder: "Search files...",
      fileType: "File Type",
      allTypes: "All Types",
      images: "Images",
      videos: "Videos",
      documents: "Documents",
      noMedia: "No media files yet",
      uploadFirst: "Upload your first file to get started"
    },
    
    team: {
      title: "Team Workspace",
      subtitle: "Collaborate with your team on content",
      createWorkspace: "Create Workspace",
      selectWorkspace: "Select Workspace",
      members: "Members",
      tasks: "Tasks",
      approvals: "Approvals",
      teamMembers: "Team Members",
      inviteMember: "Invite Member",
      inviteNewMember: "Invite New Member",
      role: "Role",
      viewer: "Viewer",
      editor: "Editor",
      admin: "Admin",
      owner: "Owner",
      sendInvite: "Send Invitation",
      workspaceCreated: "Workspace created successfully",
      inviteSent: "Invitation sent successfully",
      createTask: "Create Task",
      taskTitle: "Task Title",
      description: "Description",
      priority: "Priority",
      low: "Low",
      medium: "Medium",
      high: "High",
      urgent: "Urgent",
      dueDate: "Due Date",
      taskCreated: "Task created successfully",
      noApprovals: "No pending approvals",
      newWorkspace: "New Workspace",
      workspaceDescription: "Create a new workspace for your team",
      workspaceName: "Workspace Name",
      create: "Create"
    },
    
    search: "Search",
    email: "Email",
    error: "Error",
    success: "Success",
    cancel: "Cancel",
    
    // Top level
    home: "Home",
    "pricing.title": "Simple & Transparent Pricing",
    "pricing.subtitle": "Choose the plan that fits your workflow. Start free, upgrade anytime.",
    "pricing.free": "Free",
    "pricing.freePrice": "€0",
    "pricing.freeDesc": "Perfect for trying out AdTool AI",
    "pricing.freeFeature1": "20 AI captions per month",
    "pricing.freeFeature2": "Basic templates",
    "pricing.freeFeature3": "Community support",
    "pricing.tryFree": "Start for Free",
    "pricing.proMonthly": "Basic",
    "pricing.proYearly": "Pro",
    "pricing.month": "month",
    "pricing.year": "month",
    "pricing.cancelAnytime": "Most Popular",
    "pricing.saveFortyTwo": "For Power Users",
    "pricing.proFeature1": "200 AI captions per month",
    "pricing.proFeature2": "All premium templates",
    "pricing.proFeature3": "Hashtag Generator",
    "pricing.proFeature4": "Manage up to 2 brands",
    "pricing.proFeature5": "Priority email support",
    "pricing.startNow": "Upgrade to Basic",
    "pricing.benefit1": "Cancel anytime",
    "pricing.benefit2": "Secure via Stripe",
    "pricing.benefit3": "Ready in 60 seconds",
    
    pricingDetails: {
      header: {
        badge: "Simple & Transparent Pricing",
        title: "Grow with AdTool AI",
        subtitle: "Choose the plan that fits your workflow. Start free, upgrade anytime.",
      },
      period: "month",
      popularBadge: "POPULAR",
      loading: "Loading...",
      plans: {
        free: {
          title: "Free",
          subtitle: "Get Started",
          description: "Perfect for trying out AdTool AI",
          buttonText: "Start for Free",
          features: [
            "20 AI captions per month",
            "Basic templates",
            "Community support",
            "Hashtag suggestions",
            "Brand management",
            "Analytics",
            "Watermark on exports",
          ],
        },
        basic: {
          title: "Basic",
          subtitle: "Most Popular",
          description: "Best for content creators & small businesses",
          buttonText: "Upgrade to Basic",
          features: [
            "200 AI captions per month",
            "All premium templates",
            "Hashtag Generator",
            "Manage up to 2 brands",
            "Remove watermark",
            "Priority email support",
            "Analytics dashboard",
            "Team collaboration",
          ],
        },
        pro: {
          title: "Pro",
          subtitle: "For Power Users",
          description: "Perfect for agencies & teams",
          buttonText: "Go Pro",
          features: [
            "Unlimited AI captions",
            "Unlimited brands",
            "Advanced AI models",
            "Team collaboration tools",
            "Analytics dashboard",
            "White-label exports",
            "Priority support & onboarding",
            "Custom integrations",
          ],
        },
      },
      custom: {
        title: "Need a custom plan?",
        description: "We offer tailored solutions for enterprises and large teams.",
        contact: "Contact us at bestofproducts4u@gmail.com",
      },
      errors: {
        checkoutFailed: "Checkout could not be started",
      },
    },
    
    pricingPage: {
      title: "Simple, Transparent Pricing",
      subtitle: "Choose the plan that fits your workflow. Start free, upgrade anytime.",
      plans: {
        basic: {
          name: "Basic",
          price: "14.99",
          currency: "€",
          period: "month",
          credits: "800 credits",
          description: "Perfect for content creators and small businesses",
          features: [
            "All premium templates",
            "Hashtag generator",
            "Manage up to 2 brands",
            "Remove watermark",
            "Manual post scheduling",
            "Priority email support",
            "Analytics dashboard"
          ],
          button: "Upgrade to Basic"
        },
        pro: {
          name: "Pro",
          price: "34.99",
          currency: "€",
          period: "month",
          credits: "2,500 credits",
          description: "Best for agencies and teams",
          features: [
            "Everything in Basic",
            "AI Auto-Schedule",
            "Advanced AI models",
            "Team collaboration tools",
            "Analytics dashboard",
            "White-label exports",
            "Priority support & onboarding"
          ],
          button: "Upgrade to Pro"
        },
        enterprise: {
          name: "Enterprise",
          price: "69.99",
          currency: "€",
          period: "month",
          credits: "Unlimited credits",
          description: "For large teams and agencies",
          features: [
            "Everything in Pro",
            "API and integration access",
            "Priority support",
            "Agency tools & white-labeling",
            "Custom integrations",
            "Dedicated account manager"
          ],
          button: "Upgrade to Enterprise"
        }
      }
    },
    
    pricing: {
      promo: {
        placeholder: "Enter promo code",
        apply: "Apply",
        invalid: "Invalid promo code",
        error: "Error validating code",
        applied: "Code applied",
        for3months: "for 3 months",
        hint: "With Creator Code: −30% for 3 months • Creator receives 20% commission"
      },
      intro: {
        basic: "Intro Month: Only €4.99 instead of €14.99",
        enterprise: "Intro Month: Only €9.99 instead of €69.99",
        monthly: "Cancel anytime"
      },
      features: {
        quickPostLocked: "Quick Calendar Post (Pro Feature)",
        quickPostDesc: "Instantly schedule posts with one click—upgrade to Pro or Enterprise to unlock this feature.",
        autoScheduleLocked: "AI Auto-Schedule (Pro Feature)",
        autoScheduleDesc: "Let AI automatically find the best times to post—available in Pro and Enterprise plans."
      },
      upgrade: {
        toPro: "Upgrade to Pro",
        toEnterprise: "Upgrade to Enterprise"
      }
    },
    
    faq: {
      title: "Frequently Asked Questions",
      questions: {
        q1: {
          question: "What is CaptionGenie?",
          answer: "CaptionGenie is an AI-powered tool that helps you create engaging, platform-optimized captions for your social media posts. It saves you time while ensuring your content reaches its full potential."
        },
        q2: {
          question: "How does the AI work?",
          answer: "Our AI analyzes your input (topic, tone, target audience) and generates customized captions based on current best practices for each platform. It learns from millions of successful posts to deliver high-quality results."
        },
        q3: {
          question: "Can I try it for free?",
          answer: "Yes! We offer a free plan with 20 AI-generated captions per month. No credit card required to start."
        },
        q4: {
          question: "What platforms are supported?",
          answer: "CaptionGenie supports Instagram, TikTok, Facebook, LinkedIn, Twitter/X, and YouTube. Each platform has its own optimized caption style."
        },
        q5: {
          question: "Can I customize the generated captions?",
          answer: "Absolutely! Every generated caption is fully editable. Use it as-is or adjust it to match your unique voice."
        },
        q6: {
          question: "How do I cancel my subscription?",
          answer: "You can cancel anytime from your account settings. Your access continues until the end of your billing period."
        }
      }
    },
    backToHome: "Back to Home",
    footer_rights: "All rights reserved",
    platform: "Platform",
    language: "Language",
    
    // Cookie Consent
    consent: {
      banner: {
        title: "We value your privacy",
        description: "We use cookies to improve our website, provide statistics, and show relevant content. You can customize your choices. Learn more in our Privacy Policy.",
        privacyLink: "Privacy Policy",
        imprintLink: "Imprint",
        ariaLabel: "Cookie consent banner"
      },
      buttons: {
        acceptAll: "Accept All",
        rejectAll: "Reject All",
        customize: "Customize",
        savePreferences: "Save Preferences"
      },
      preferences: {
        title: "Cookie Preferences",
        description: "Manage your cookie settings. You can change these at any time via Cookie Settings in the footer."
      },
      categories: {
        necessary: {
          title: "Necessary Cookies",
          description: "Required for basic website functionality (session, security, consent).",
          examples: "Session cookies, security tokens, consent storage"
        },
        analytics: {
          title: "Statistics & Analytics",
          description: "Help us understand how the website is used (anonymized).",
          examples: "Google Analytics, usage statistics, performance metrics"
        },
        marketing: {
          title: "Marketing & Advertising",
          description: "Used to show relevant offers and retargeting.",
          examples: "Facebook Pixel, Google Ads, retargeting cookies"
        },
        comfort: {
          title: "Comfort & Personalization",
          description: "Additional features like embedded media and personalization.",
          examples: "YouTube embeds, personalized content, saved preferences"
        }
      },
      footer: {
        linkText: "Cookie Settings"
      }
    },
    characters: "Characters",
    copy: "Copy",
    copied_to_clipboard: "Copied to clipboard",
    generating: "Generating...",
    success_title: "Success",
    error_title: "Error",
    error_auth: "Authentication required",
    error_login_required: "Please log in to continue",
    
    // Categories
    category: {
      create: "Create",
      optimize: "Optimize",
      analyze: "Analyze & Goals",
      design: "Design & Visuals"
    },
    
    // Hubs (New IA Structure)
    hubs: {
      planen: "Plan",
      erstellen: "Create",
      optimieren: "Optimize",
      analysieren: "Analyze",
      automatisieren: "Automate",
      medien: "Media",
      team: "Team",
      verwaltung: "Management"
    },
    
    // Dashboard
  header: {
    brand: "AdTool AI Home",
    userMenu: "User Menu",
    credits: "Credits",
    account: "Account",
    billing: "Billing",
    support: "Support",
    logout: "Logout",
  },
  commandBar: {
    placeholder: "Search or Cmd+K",
    searchPlaceholder: "Search for features, pages...",
    noResults: "No results found.",
    hint: "Press Cmd+K to open search",
    other: "Other",
  },
  dashboard: {
    statusBar: {
      tipOfTheDay: "Tip of the Day",
      connectedAccounts: "connected",
      nextPost: "Next Post"
    },
      quickActions: {
        quickSchedule: "Quick Schedule",
        openCalendar: "Open Calendar",
        postFromTemplate: "Post from Template",
        openPerformance: "Open Performance"
      },
      sections: {
        today: "Today",
        todayDescription: "Posts due today",
        thisWeek: "This Week",
        thisWeekDescription: "Planning overview for the next 7 days",
        performance: "Performance Overview",
        performanceDescription: "Track your key metrics at a glance",
        bestTimes: "Best Posting Times",
        bestTimesDescription: "Optimal times for maximum reach",
        recentActivity: "Recent Activity",
        recentActivityDescription: "Your recent actions at a glance"
      },
      emptyState: {
        noPosts: "No posts scheduled today",
        createNow: "Create a new post now or use auto-scheduling"
      },
      metrics: {
        reach7d: "Reach (7 Days)",
        engagementRate: "Engagement Rate",
        publishedPosts: "Published Posts",
        vsLastWeek: "vs. last week",
        avgAllPosts: "Average across all posts",
        thisMonth: "This month"
      },
      postActions: {
        open: "Open",
        publishNow: "Publish Now",
        retry: "Retry"
      }
    },
    featureCards: {
      sectionTitle: "Features",
      sectionSubtitle: "Start with clear workflows – in just a few steps.",
      automation: {
        title: "Post Automation",
        description: "Plan your month – automatic publishing at the best time."
      },
      analytics: {
        title: "Performance Analytics",
        description: "Discover what works – detailed insights for better decisions."
      },
      brandKit: {
        title: "Brand Kit & Consistency",
        description: "Fonts, colors, templates – post consistently on brand."
      },
      coach: {
        title: "AI Content Coach",
        description: "Real-time feedback on captions, hashtags, and tone."
      },
      publishing: {
        title: "Multi-Platform Publishing",
        description: "Post simultaneously on IG, TikTok, LinkedIn, X, YouTube."
      },
      goals: {
        title: "Goals & Achievements",
        description: "Set social goals, track progress, celebrate milestones."
      }
    },
    heroBanner: {
      heading: "Plan, publish & analyze social posts – faster with AI.",
      subheading: "Start free. Upgrade anytime.",
      ctaPrimary: "Quick Plan",
      ctaSecondary: "Open Calendar",
      stats: {
        engagement: "Engagement Rate ↑",
        posts: "Published Posts",
        accounts: "Connected Accounts"
      },
      trust: {
        title: "GDPR Compliant • Secure Payment",
        subtitle: "Your data is safe",
        integrations: "Integrations"
      }
    },
    footer: {
      tagline: "AI-powered social media management"
    },
    
    // Navigation (kept for compatibility)
    nav: {
      home: "Home",
      calendar: "Smart Calendar",
      composer: "Composer",
      postTimeAdvisor: "Post Time Advisor",
      generator: "AI Caption Generator",
      carousel: "Carousel Generator",
      promptWizard: "Prompt Assistant",
      reelScript: "AI Reel Script",
      hookGenerator: "Hook Generator",
      aiPostGenerator: "AI Post Generator",
      imageCaptionPairing: "Image Caption Pairing",
      backgroundReplacer: "Background Replacer",
      rewriter: "Caption Rewriter",
      coach: "AI Content Coach",
      bioOptimizer: "AI Bio Optimizer",
      commentManager: "AI Comment Manager",
      templateManager: "Template Manager",
      performance: "Performance Insights",
      analytics: "Analytics Dashboard",
      analyticsAdvanced: "Advanced Analytics",
      goals: "Goals Dashboard",
      trendRadar: "Trend Radar",
      allComments: "All Comments",
      audit: "Content Audit",
      campaigns: "Campaign Assistant",
      integrations: "Integrations",
      mediaLibrary: "Media Library",
      mediaProfiles: "Media Profiles",
      teamWorkspace: "Team Workspace",
      whiteLabel: "White Label",
      brandKit: "Brand Kit",
      credits: "Credits",
      account: "Account",
      billing: "Billing",
      pricing: "Pricing",
      faq: "FAQ"
    },
    
    // Authentication
    auth: {
      login: "Sign In",
      signup: "Sign Up",
      logout: "Logout",
      account: "Account",
      loginTitle: "Sign in to your account",
      signupTitle: "Create your account",
      email: "Email",
      password: "Password"
    },
    
    // Common
    common: {
      language: "en",
      error: "Error",
      success: "Success",
      cancel: "Cancel",
      generating: "Generating...",
      uploading: "Uploading...",
      comingSoon: "Coming Soon",
      featureComingSoon: "This feature is coming soon!",
      upgradeRequired: "Upgrade Required",
      upgradeToPro: "Upgrade to Pro",
      locked: "Locked",
      requiresPro: "Requires Pro Plan",
      getStarted: "Get Started",
      startNow: "Start now",
      friendly: "Friendly",
      professional: "Professional",
      funny: "Funny",
      inspirational: "Inspirational",
      bold: "Bold",
      emotional: "Emotional",
      informative: "Informative",
      playful: "Playful",
      close: "Close"
    },
    
    // Hero section
    hero: {
      title: "Your AI-powered Social Media Management Platform",
      subtitle: "Create, optimize, and analyze your content — professionally, efficiently, scalably.",
      cta: "Start for free",
      demo: "View Demo",
      login: "Sign In",
      tryFree: "Try Free"
    },

    // UI enhancements
    ui: {
      welcome: {
        greeting: "Welcome back, {name}!",
        weeklyProgress: "You've created {count} posts this week. {remaining} more to hit your goal!",
        tipOfTheDay: "Tip of the day",
        goal: "More to go until goal!"
      },
      badge: {
        new: "New",
        pro: "Pro",
        cancelAnytime: "Cancel anytime"
      },
      category: {
        createDesc: "Turn ideas into engaging content",
        optimizeDesc: "Refine and schedule your content",
        analyzeDesc: "Track performance and achieve your goals",
        designDesc: "Create on-brand visuals, carousels & image captions"
      },
      trust: {
        cancelAnytime: "Cancel anytime",
        securePayment: "Secure payment",
        readyInSeconds: "Ready in 60 seconds"
      }
    },
    
    trends: {
      title: "AI Trend Radar",
      subtitle: "Discover viral trends, content ideas, and growth opportunities for your niche",
      discover: "Discover",
      saved: "Saved",
      discoverNiche: "Discover Your Niche",
      topTrends: "Top Trends of the Week",
      topTrendsSubtitle: "Hottest trends right now",
      allTrends: "All Trends",
      search: "Search",
      searchPlaceholder: "Search trends, hashtags, products...",
      ideas: "ideas",
      viewDetails: "View Details",
      analyzing: "Analyzing...",
      popularity: "Popularity",
      platform: "Platform",
      category: "Category",
      allPlatforms: "All Platforms",
      allCategories: "All Categories",
      niches: {
        socialMedia: "Social Media Growth",
        ecommerce: "Viral for E-Commerce",
        lifestyle: "Lifestyle & Health",
        business: "Business & AI Tools",
        motivation: "Motivation & Education",
        finance: "Finance & Side Hustles",
      }
    },
    
    // Performance tracker
    performance: {
      title: "Performance Tracker",
      subtitle: "Analyze your post performance across all platforms",
      tabs: {
        overview: "Overview",
        trends: "Engagement Trends",
        insights: "Caption Insights",
        connections: "Connections"
      },
      kpi: {
        avgEngagement: "Avg Engagement Rate",
        totalPosts: "Total Posts Analyzed",
        bestDay: "Best Day to Post",
        bestHour: "Best Hour to Post"
      },
      charts: {
        engagementOverTime: "Engagement Over Time",
        providerDistribution: "Platform Distribution",
        topPosts: "Top Posts by Engagement"
      },
      actions: {
        syncLatest: "Sync Latest Data"
      },
      connections: {
        title: "Social Media Connections",
        description: "Connect your social media accounts to automatically sync post performance data",
        connect: "Connect",
        reconnect: "Reconnect",
        disconnect: "Disconnect",
        lastSync: "Last Sync",
        comingSoon: "Coming Soon",
        oauthComingSoon: "OAuth integration coming soon"
      },
      csv: {
        title: "CSV Upload",
        description: "Upload your post metrics manually via CSV file",
        upload: "Upload CSV",
        uploadTitle: "Upload Post Metrics",
        uploadDescription: "Import post performance data from a CSV file",
        formatInfo: "CSV must include: post_id, platform, posted_at, and at least one metric",
        downloadTemplate: "Download Template",
        selectFile: "Select CSV File",
        selectedFile: "Selected file",
        invalidFile: "Please select a valid CSV file",
        noFile: "Please select a file first",
        noValidRows: "No valid rows found in CSV",
        uploadSuccess: "Successfully imported {count} posts"
      },
      trends: {
        dayOfWeek: "Engagement by Day of Week",
        mediaType: "Engagement by Media Type",
        topPosts: "Top 20 Posts"
      },
      table: {
        caption: "Caption",
        platform: "Platform",
        engagement: "Engagement",
        likes: "Likes",
        comments: "Comments",
        date: "Date",
        link: "Link"
      },
      insights: {
        title: "AI Insights",
        subtitle: "Get AI-powered recommendations to improve your content strategy",
        generate: "Generate New Insights",
        generated: "AI insights generated successfully",
        empty: "No insights yet. Generate your first AI analysis.",
        generateFirst: "Generate AI Insights",
        noPosts: "No Posts Found",
        noPostsDescription: "Upload posts before generating insights",
        summary: "Performance Summary",
        topStyles: "Best Performing Styles",
        bestTimes: "Optimal Posting Times",
        recommendations: "Actionable Recommendations",
        recalculate: "Recalculate",
        notEnoughData: "Not enough data for insights yet (min. 10 posts required)",
        priority: {
          high: "Important",
          medium: "Medium",
          low: "Optional"
        }
      }
    },
    
    // Calendar
    calendar_title: "Smart Content Calendar",
    calendar_add_post: "Add Post",
    calendar_add_note: "Add Note",
    calendar_export: "Export to Google Calendar",
    calendar_platform: "Platform",
    calendar_caption: "Caption",
    calendar_schedule_date: "Schedule Date & Time",
    calendar_status: "Status",
    calendar_draft: "Draft",
    calendar_scheduled: "Scheduled",
    calendar_posted: "Posted",
    calendar_note_text: "Note",
    calendar_upgrade_required: "Upgrade to Pro to create and manage your content calendar",
    calendar_schedule_post: "Schedule Post",
    calendar_image_upload: "Upload Image (Optional)",
    calendar_tags: "Tags (Optional)",
    
    // Bio Optimizer
    bio_title: "AI Bio Optimizer",
    bio_input_audience: "Target Audience",
    bio_input_topic: "Focus / Niche",
    bio_input_tone: "Tone / Personality",
    bio_input_keywords: "Keywords (Optional)",
    bio_generate: "Generate Bio",
    bio_explanation: "Why this works",
    bio_copy: "Copy Bio",
    bio_preview: "Preview Profile",
    bio_regenerate: "Regenerate",
    bio_brand_voice: "Brand Voice",
    bio_save_brand_voice: "Save Brand Voice",
    bio_apply_brand_voice: "Apply Saved Brand Voice",
    bio_history_title: "Recent Bios",
    bio_limit_reached: "Daily limit reached. Upgrade to Pro for unlimited bio generation.",
    bio_tone_friendly: "Friendly",
    bio_tone_professional: "Professional",
    bio_tone_bold: "Bold",
    bio_tone_humorous: "Humorous",
    bio_tone_inspirational: "Inspirational",
    
    // Image Caption Pairing
    image_caption_title: "AI Image Caption Pairing",
    image_caption_subtitle: "Upload an image and get AI-generated captions",
    upload_image: "Upload Image",
    drag_drop_image: "Drag & drop your image here or click to browse",
    analyzing_image: "Analyzing image...",
    generate_captions: "Generate Captions",
    generating_captions: "Generating captions...",
    regenerate: "Regenerate",
    copy_caption: "Copy Caption",
    use_in_generator: "Use in Generator",
    caption_copied: "Caption copied to clipboard!",
    image_analysis: "Image Analysis",
    detected_objects: "Detected Objects",
    scene_type: "Scene Type",
    emotion: "Emotion",
    theme: "Theme",
    caption_style_emotional: "Emotional",
    caption_style_funny: "Funny",
    caption_style_minimal: "Minimal",
    caption_style_storytelling: "Storytelling",
    caption_style_engagement: "Engagement",
    upload_error: "Failed to upload image",
    analysis_error: "Failed to analyze image",
    select_platform: "Select Platform",
    history_title: "Recent Uploads",
    no_history: "No recent uploads yet",
    delete_item: "Delete",
    image_caption_limit_reached: "Daily limit reached. Upgrade to Pro for unlimited uploads.",
    max_file_size: "Maximum file size: 10 MB",
    supported_formats: "Supported: JPEG, PNG, WebP",
    
    // Brand Kit
    brand_kit_title: "Auto-Brand Kit",
    brand_kit_subtitle: "Upload your logo and define your brand identity",
    brand_kit_upload_logo: "Upload Logo",
    brand_kit_primary_color: "Primary Color",
    brand_kit_secondary_color: "Secondary Color (Optional)",
    brand_kit_description: "Brand Description",
    brand_kit_description_placeholder: "E.g., Playful fitness brand for women 25-35",
    brand_kit_tone: "Tone Preference",
    brand_kit_tone_modern: "Modern",
    brand_kit_tone_minimalist: "Minimalist",
    brand_kit_tone_playful: "Playful",
    brand_kit_tone_elegant: "Elegant",
    brand_kit_tone_bold: "Bold",
    brand_kit_generate: "Generate Brand Kit",
    brand_kit_regenerate: "Regenerate",
    brand_kit_generating: "Generating your brand kit...",
    brand_kit_color_palette: "Color Palette",
    brand_kit_font_pairing: "Font Pairing",
    brand_kit_headline_font: "Headline",
    brand_kit_body_font: "Body",
    brand_kit_mood: "Mood",
    brand_kit_keywords: "Keywords",
    brand_kit_usage: "Usage Tips",
    brand_kit_ai_insight: "Why This Fits Your Brand",
    brand_kit_copy_hex: "Copy HEX",
    brand_kit_copied: "Copied!",
    brand_kit_my_kits: "My Brand Kits",
    brand_kit_no_kits: "No brand kits yet",
    brand_kit_create_first: "Create your first brand kit to get started",
    brand_kit_delete_confirm: "Are you sure you want to delete this brand kit?",
    
    // Carousel Generator
    carousel_title: "Carousel Generator",
    carousel_subtitle: "Transform text into engaging slide decks",
    carousel_input_label: "Your Content",
    carousel_input_placeholder: "Paste your text or bullet points here (2-2,500 characters)...",
    carousel_slide_count: "Number of Slides",
    carousel_platform: "Platform",
    carousel_style: "Style Template",
    carousel_brand_kit: "Brand Kit",
    carousel_brand_kit_default: "Use default theme",
    carousel_cta_toggle: "Include CTA slide",
    carousel_generate: "Generate Slides",
    carousel_improve: "Improve Readability",
    carousel_regenerate: "Regenerate Outline",
    carousel_export_png: "Export PNG",
    carousel_export_pdf: "Export PDF",
    carousel_reorder: "Drag to reorder slides",
    carousel_add_slide: "Add Slide",
    carousel_remove_slide: "Remove Slide",
    carousel_edit_slide: "Click to edit",
    carousel_slide_title: "Headline",
    carousel_slide_bullets: "Bullet Points",
    carousel_no_projects: "No saved carousel projects yet",
    carousel_saved_projects: "Saved Projects",
    carousel_load_project: "Load",
    carousel_delete_project: "Delete",
    carousel_save_project: "Save Project",
    carousel_watermark_info: "Free plan includes watermark",
    carousel_upgrade_for_more: "Upgrade to Pro for 10 slides, PDF export, and no watermark",
    carousel_pdf_pro_only: "PDF export is a Pro feature",
    
    // AI Content Coach
    coach_title: "AI Content Coach",
    coach_subtitle: "Get personalized strategy advice from your AI mentor",
    coach_input_placeholder: "Ask me anything about your content strategy...",
    coach_send: "Send",
    coach_reset: "Reset Conversation",
    coach_export: "Export Chat (PDF)",
    coach_typing: "Coach is typing...",
    coach_limit_reached: "Daily limit reached (5 messages). Upgrade to Pro for unlimited coaching.",
    coach_quick_prompts: "Quick Questions",
    coach_prompt_1: "How can I double my LinkedIn reach?",
    coach_prompt_2: "Give me 3 ideas for viral Reels this week",
    coach_prompt_3: "What's the best posting schedule for a tech brand?",
    coach_prompt_4: "Rewrite my caption for more engagement",
    coach_no_messages: "Start a conversation with your AI Content Coach",
    coach_new_session: "New Conversation",
    
    // AI Campaign Assistant
    campaign_title: "AI Campaign Assistant",
    campaign_subtitle: "Plan entire content campaigns with AI-generated strategies",
    campaign_goal_label: "Campaign Goal",
    campaign_goal_placeholder: "E.g., Promote my new eBook on healthy eating",
    campaign_topic_label: "Theme / Topic",
    campaign_topic_placeholder: "E.g., Fitness Challenge, AI Tools for Small Business",
    campaign_duration_label: "Duration (weeks)",
    campaign_platform_label: "Platform(s)",
    campaign_audience_label: "Target Audience (optional)",
    campaign_audience_placeholder: "E.g., young professionals in tech",
    campaign_tone_label: "Tone of Voice",
    campaign_tone_friendly: "Friendly",
    campaign_tone_bold: "Bold",
    campaign_tone_educational: "Educational",
    campaign_tone_emotional: "Emotional",
    campaign_tone_corporate: "Corporate",
    campaign_frequency_label: "Posts per Week",
    campaign_generate: "Generate Campaign Plan",
    campaign_generating: "Generating campaign...",
    campaign_summary: "Campaign Overview",
    campaign_week: "Week",
    campaign_theme: "Theme",
    campaign_day: "Day",
    campaign_type: "Type",
    campaign_title_col: "Title",
    campaign_caption: "Caption Outline",
    campaign_hashtags: "Hashtags",
    campaign_cta: "CTA",
    campaign_best_time: "Best Time",
    campaign_send_to_calendar: "Add to Calendar",
    campaign_open_generator: "Open in Generator",
    campaign_hashtag_strategy: "Hashtag Strategy",
    campaign_posting_tips: "Posting Tips",
    campaign_export_pdf: "Export PDF",
    campaign_delete: "Delete Campaign",
    campaign_my_campaigns: "My Campaigns",
    campaign_no_campaigns: "No campaigns yet. Create your first campaign!",
    campaign_limit_reached: "Free plan allows 1 campaign (max 1 week). Upgrade to Pro for unlimited campaigns up to 8 weeks.",
    campaign_created: "Campaign created successfully!",
    campaign_deleted: "Campaign deleted",
    campaign_added_to_calendar: "Posts added to calendar",
    
    // Content Audit
    audit_title: "Content Audit Tool",
    audit_subtitle: "Analyze your captions for engagement potential with AI-powered insights",
    audit_input_label: "Enter Your Captions",
    audit_input_placeholder: "Paste your caption here...\n\nFor multiple captions, separate them with ---",
    audit_platform_label: "Platform",
    audit_analyze_button: "Analyze Captions",
    audit_analyzing: "Analyzing your content...",
    audit_results_title: "Analysis Results",
    audit_avg_score: "Average Engagement Score",
    audit_caption_preview: "Caption",
    audit_emotion: "Emotion",
    audit_cta_strength: "CTA Strength",
    audit_engagement_score: "Score",
    audit_suggestions: "Suggestions",
    audit_overall_feedback: "Overall Feedback",
    audit_history_title: "Previous Audits",
    audit_no_history: "No audit history yet",
    audit_delete: "Delete",
    audit_limit_reached: "Daily Limit Reached",
    audit_upgrade_message: "Free users can analyze up to 3 captions per day. Upgrade to Pro for unlimited audits.",
    audit_strong: "Strong",
    audit_weak: "Weak",
    audit_missing: "Missing",
    audit_word_count: "Words",
    audit_reading_level: "Reading Level",
    
    // AI Post Generator
    aipost_title: "AI Post Generator",
    aipost_subtitle: "Transform images into complete social posts with AI-powered design",
    aipost_upload_image: "Upload Image",
    aipost_description: "Brief Description",
    aipost_description_placeholder: "E.g., Promo for new protein shake",
    aipost_platforms: "Platforms",
    aipost_style: "Style Preset",
    aipost_tone: "Tone of Voice",
    aipost_brand_kit: "Brand Kit",
    aipost_cta: "Call to Action (Optional)",
    aipost_cta_placeholder: "E.g., Shop now, DM to join",
    aipost_generate_button: "Generate Complete Post",
    aipost_generating: "Generating your post...",
    aipost_preview: "Preview",
    aipost_headline: "Headline",
    aipost_caption: "Caption",
    aipost_hashtags: "Hashtags",
    aipost_copy_caption: "Copy Caption",
    aipost_download: "Download",
    aipost_send_to_calendar: "Send to Calendar",
    aipost_open_in_generator: "Open in Generator",
    aipost_history: "History",
    aipost_no_history: "No generated posts yet",
    aipost_style_clean: "Clean",
    aipost_style_bold: "Bold",
    aipost_style_lifestyle: "Lifestyle",
    aipost_style_elegant: "Elegant",
    aipost_style_corporate: "Corporate",
    aipost_tone_friendly: "Friendly",
    aipost_tone_informative: "Informative",
    aipost_tone_persuasive: "Persuasive",
    aipost_tone_playful: "Playful",
    aipost_tone_professional: "Professional",
    
    // Background Replacer
    bg_title: "AI Background Replacer",
    bg_subtitle: "Transform product photos with AI-generated themed backgrounds",
    bg_upload_product: "Upload Product Image",
    bg_choose_theme: "Choose Theme",
    bg_lighting: "Lighting Preference",
    bg_style_intensity: "Style Strength",
    
    // Trend Radar
    trendRadar: {
      trend_title: "AI Trend Radar",
      fetch_button: "Fetch Latest Trends",
      generate_post: "Generate Content",
      bookmark: "Save Trend",
      ideas: "Content Ideas",
      trending_now: "What's trending right now",
      filter_platform: "Platform",
      filter_language: "Language",
      filter_category: "Category",
      popularity: "Popularity",
      view_ideas: "View Ideas",
      add_to_campaign: "Add to Campaign",
      bookmarked: "Bookmarked",
      analyzing: "Analyzing trend...",
      no_trends: "No trends found",
      error_loading: "Error loading trends",
    },
    bg_generate_scenes: "Generate Scenes",
    bg_generating: "Generating 10 variants...",
    bg_preview: "Preview Gallery",
    bg_download_selected: "Download Selected",
    bg_download_all: "Download All (ZIP)",
    bg_use_in_post: "Use in Post Generator",
    bg_schedule: "Schedule Post",
    bg_history: "Recent Projects",
    bg_no_history: "No projects yet",
    bg_removing_bg: "Removing background...",
    bg_theme_outdoor: "Outdoor / Nature",
    bg_theme_workspace: "Professional Workspace",
    bg_theme_studio: "Minimal Studio",
    bg_theme_urban: "Urban Lifestyle",
    bg_theme_home: "Home Interior",
    bg_theme_retail: "Retail / Shelf",
    bg_theme_kitchen: "Kitchen / Food Prep",
    bg_theme_abstract: "Abstract Gradient",
    bg_lighting_natural: "Natural",
    bg_lighting_studio: "Soft Studio",
    bg_lighting_dramatic: "Dramatic",
    bg_lighting_neutral: "Neutral",
    bg_limit_reached: "Daily limit reached. Upgrade to Pro for unlimited generations.",
    bg_pro_themes: "Pro themes: All 8 themes available",
    
    // Reel Script Generator
    reelScript: {
      title: "AI Reel Script Generator",
      subtitle: "Create complete video scripts for Reels, TikToks, or Shorts",
      input_section: "Script Details",
      input_description: "Provide your video idea and we'll create a complete script",
      idea_label: "Idea or Caption",
      idea_placeholder: "e.g., I want to make a Reel about healthy smoothies",
      platform: "Platform",
      duration: "Video Duration",
      tone: "Tone of Voice",
      brand_kit: "Brand Kit (optional)",
      language_label: "Language",
      generate_button: "Generate Script",
      generating: "Creating your script...",
      free_limit: "Free: 2 scripts/day • Pro: Unlimited",
      limit_reached: "Daily limit reached",
      upgrade_message: "Upgrade to Pro for unlimited script generation",
      no_script: "Your generated script will appear here",
      empty_state_hint: "Fill in your idea above and click 'Generate Script' to create a professional video script with exact timing, voice-over, on-screen text, and shot suggestions.",
      caption: "Post Caption",
      copy_caption: "Copy Caption",
      next_steps: "Next Steps",
      send_to_calendar: "Add to Calendar",
      send_to_post: "Create Visual Post",
      export_pdf: "Export as PDF (Pro)",
      beats_timeline: "Beats Timeline",
      beats_description: "Follow this beat-by-beat breakdown to create your video",
      voiceover: "Voice-over",
      onscreen: "On-screen",
      shot: "Shot",
      cta_broll: "Call-to-Action & B-Roll",
      call_to_action: "Call-to-Action",
      broll_suggestions: "B-Roll Suggestions",
      hashtags: "Hashtags",
      copy_sections: "Copy Sections",
      copy_vo: "Voice-over",
      copy_onscreen: "On-screen Text",
      copy_shots: "Shot List",
      copy_hashtags: "Hashtags",
      download_txt: "Download .txt",
      copied: "copied",
      downloaded: "Script downloaded",
      success: "Script generated!",
      script_ready: "Your script is ready to use",
      fallback_used: "Fallback script generated",
      fallback_description: "Generated with fallback - ready to use immediately or retry",
      fallback_banner: "This is a fallback version. It's ready to use immediately, or you can try regenerating.",
      retrying: "Retrying...",
      rate_limit_retry: "Rate limit hit, retrying in 1.5 seconds",
      error_empty_idea: "Idea required",
      error_idea_too_short: "Please enter at least 10 characters for your video idea",
      error_idea_too_long: "Idea too long",
      error_max_1500: "The idea must be maximum 1500 characters.",
      request_id: "Request ID",
      error_auth_required: "Authentication required",
      error_please_login: "Please log in to create scripts",
      error_validation: "Invalid input",
      error_check_inputs: "Please check your inputs (idea length, platform, duration)",
      error_rate_limit: "Rate limit reached",
      error_wait_retry: "Too many requests. Please wait 30-60 seconds and try again.",
      error_payment: "Credits required",
      error_add_credits: "AI service credits exhausted. Please add credits to continue.",
      error_failed: "Generation failed",
      error_unexpected: "Unexpected error generating script. Our team has been notified.",
    },
    
    // Comment Manager
    commentManager: {
      title: "AI Comment Manager",
      subtitle: "Manage comments with AI-powered reply suggestions",
      import_label: "Import Comments",
      import_description: "Upload comments for analysis and reply suggestions",
      platform: "Platform",
      brand_tone: "Brand Tone",
      manual_input: "Comments",
      input_placeholder: "Paste comments (one per line):\nusername | comment text",
      input_format: "Format: username | comment text (one per line)",
      analyze_button: "Analyze Comments",
      analyzing: "Analyzing comments...",
      free_limit: "Free: 20 comments/day • Pro: Unlimited + Auto-Reply",
      limit_reached: "Daily limit reached",
      upgrade_message: "Upgrade to Pro for unlimited comment analysis",
      comments_list: "Comments & Replies",
      total_comments: "comments",
      no_comments: "No comments yet. Import comments to get started.",
    },
    
    // Generator
    generator_title: "Text Generator",
    generator_card_title: "Generate Your Caption",
    generator_card_description: "Fill in the details to create the perfect social media caption",
    usage_counter: "{used}/{total} captions today",
    input_topic: "Topic or idea",
    input_tone: "Tone",
    input_platform: "Platform",
    btn_generate: "Generate Now",
    btn_copy: "Copy",
    btn_new: "New Idea",
    input_topic_placeholder: "Example: Healthy smoothie for the morning",
    generator_error_empty_topic: "Please enter a topic or idea.",
    generator_error_auth_required: "Please log in to create captions.",
    generator_error_invalid_input: "Please check your inputs.",
    generator_error_rate_limit: "Too many requests. Please wait a moment and try again.",
    generator_error_limit_reached: "Daily limit reached. Upgrade to Pro for unlimited generations.",
    generator_error_payment_required: "AI credits exhausted. Please add credits.",
    generator_error_service_unavailable: "Service temporarily unavailable. Please try again later.",
    generator_error_unexpected: "Unexpected error creating caption. Please try again later.",
    generator_error_retrying: "Retrying request...",
    
    // Tone options
    tone_friendly: "Friendly",
    tone_professional: "Professional",
    tone_funny: "Funny",
    tone_emotional: "Emotional",
    tone_bold: "Bold",
    tone_inspirational: "Inspirational",
    tone_casual: "Casual",
    tone_formal: "Formal",
    tone_informative: "Informative",
    tone_playful: "Playful",
    
    // Prompt Wizard
    wizard: {
      title: "Prompt Assistant",
      subtitle: "Create targeted AI inputs for better results.",
      infoTitle: "Optimized Prompts for Your AI Tools",
      infoDescription: "Create tailored prompts for better AI results",
      platform: "Platform",
      goal: "Goal",
      businessType: "Business Type / Industry",
      tone: "Tone",
      keywords: "Keywords",
      generate: "Generate Prompt",
      selectPlatform: "Select platform",
      selectGoal: "Select goal",
      selectTone: "Select tone",
      businessPlaceholder: "e.g. Coaching, E-Commerce, Fitness",
      keywordsPlaceholder: "Enter keywords (e.g. Marketing, Fitness, Motivation)",
      fillFields: "Please fill in all required fields",
      generating: "Generating prompt...",
      success: "Prompt generated successfully!",
      moreReach: "More Reach",
      engagement: "Higher Engagement",
      sales: "Drive Sales",
      awareness: "Brand Awareness",
      growth: "Follower Growth",
      results: "Generated Prompt",
      optimizedPrompt: "Optimized Prompt",
      whyItWorks: "Why This Works",
      example: "Example Caption",
      useInGenerator: "Use in Generator",
      copyPrompt: "Copy Prompt",
      newIdea: "New Idea",
      copied: "Prompt copied to clipboard!"
    },
    
    // Hook Generator
    hooks: {
      title: "Hook Generator",
      subtitle: "Find attention-grabbing openings for your posts",
      usageCounter: "Created hooks: {used}/{total} today",
      inputTitle: "Topic or Content",
      inputDescription: "Enter your topic and choose platform & tone",
      topic: "Topic",
      platform: "Platform",
      tone: "Tone",
      audience: "Target Audience",
      styles: "Hook Styles",
      generate: "Generate Hooks",
      topicPlaceholder: "Example: Motivation for Monday morning",
      audiencePlaceholder: "Enter target audience",
      selectPlatform: "Select platform",
      selectTone: "Select tone",
      styleCuriosity: "Curiosity",
      styleProvocation: "Provocation",
      styleRelatable: "Relatable",
      styleHumor: "Humor",
      styleAuthority: "Authority",
      results: "Generated Hooks",
      chars: "chars",
      copy: "Copy",
      copyAll: "Copy All",
      copiedAll: "All hooks copied!",
      copied: "Hook copied!",
      useInGenerator: "Use in Generator",
      generating: "Generating...",
      success: "Hooks generated!",
      regenerated: "Hooks regenerated!",
      fillFields: "Please fill all fields",
      selectStyle: "Please select at least one style",
      limitTitle: "Daily Limit Reached",
      limitMessage: "You've reached your daily limit for free hooks. Upgrade to Pro for unlimited access.",
      helperText: "Tip: Use these hooks as opening lines for your captions"
    },
    
    // Rewriter
    rewriter_title: "Caption Rewriter",
    rewriter_subtitle: "Improve or change existing posts with AI",
    rewriter_original_caption: "Paste your caption here",
    rewriter_placeholder: "Example: Start your day with a smile and a good cup of coffee.",
    rewriter_goal_label: "Goal",
    rewriter_goal_viral: "Viral",
    rewriter_goal_emotional: "Emotional",
    rewriter_goal_professional: "Professional",
    rewriter_goal_simplify: "Simplify",
    rewriter_goal_tooltip: "Choose the desired goal for rewriting",
    rewriter_button: "Rewrite",
    rewriter_empty_state: "No rewritten caption yet",
    rewriter_result_title: "Rewritten Caption",
    rewriter_why_works: "Why This Works",
    rewriter_suggestions: "Additional Suggestions",
    rewriter_success: "Caption rewritten successfully",
    rewriter_error_empty: "Please enter text",
    rewriter_error_generic: "An error occurred during rewriting",
    rewriter_limit_title: "Daily Limit Reached",
    rewriter_limit_message: "Upgrade to Pro for unlimited rewrites",
    rewriter_usage_counter: "{count}/{limit} rewrites used today",
    rewriter_use_in_generator: "Use in Generator",
    rewriter_pro_feature: "Pro Feature - Upgrade for access",
    
    // Posting Time Advisor
    advisor: {
      title: "Posting Time Advisor",
      subtitle: "Analyze your best posting time for more reach",
      platform: "Platform",
      timezone: "Timezone",
      niche: "Topic area",
      goal: "Goal",
      analyze: "Start analysis",
      selectGoal: "Select goal (e.g., more engagement)",
      selectPlatform: "Select platform",
      infoTitle: "Find Your Optimal Posting Times",
      infoDescription: "Analyze the best times to post for maximum reach and engagement",
      nichePlaceholder: "Select topic area (e.g., Fitness, Fashion, Marketing)",
      fillFields: "Please fill in all required fields",
      success: "Analysis completed successfully!",
      copied: "Posting times copied to clipboard!",
      bestTimes: "Best Times to Post",
      explanation: "Analysis Explanation",
      proTips: "Pro Tips"
    },
    
    // Authentication
    auth_login_title: 'Login',
    auth_signup_title: 'Sign Up',
    auth_email: 'Email',
    auth_password: 'Password',
    auth_password_confirm: 'Confirm Password',
    auth_no_account: "Don't have an account?",
    auth_have_account: 'Already have an account?',
    auth_welcome_back: 'Welcome back!',
    auth_welcome_new: 'Welcome to AdTool AI!',
    auth_show_password: 'Show password',
    auth_hide_password: 'Hide password',
    auth_remember_me: 'Remember me',
    auth_forgot_password: 'Forgot password?',
    auth_login_description: 'Sign in to your account',
    auth_signup_description: 'Create your free account',
    
    // Global Buttons
    btn_analyze: "Analyze",
    btn_save: "Save",
    btn_cancel: "Cancel",
    btn_download: "Download",
    btn_export: "Export",
    btn_upload: "Upload",
    btn_login: "Sign In",
    btn_signup: "Sign Up",
    btn_logout: "Sign Out",
    btn_try: "Try now",
    btn_start: "Start now",
  },
  de: {
    // Hubs (Sidebar Navigation)
    hubs: {
      planen: "Planen",
      erstellen: "Erstellen",
      optimieren: "Optimieren",
      analysieren: "Analysieren",
      automatisieren: "Automatisieren",
      einstellungen: "Einstellungen"
    },

    // Navigation
    nav: {
      calendar: "Intelligenter Kalender",
      composer: "Composer",
      postTimeAdvisor: "Posting-Zeit-Berater",
      generator: "KI Post-Generator",
      promptWizard: "Prompt-Assistent",
      reelScript: "KI Reel-Skript",
      hookGenerator: "Hook-Generator",
      imageCaptionPairing: "Bild-Text-Pairing",
      rewriter: "Caption-Umschreiber",
      coach: "KI-Content-Coach",
      bioOptimizer: "KI Bio-Optimierer",
      commentManager: "KI Kommentar-Manager",
      analytics: "Analytics-Dashboard",
      goals: "Ziele-Dashboard",
      trendRadar: "Trend-Radar",
      campaigns: "Kampagnen-Assistent",
      integrations: "Integrationen",
      brandKit: "Brand-Kit",
      team: "Team & White-Label",
      whiteLabel: "White-Label",
      account: "Konto",
      billing: "Abrechnung"
    },
    // Feature Guides
    featureGuides: {
      common: {
        whatIsIt: "Was ist das?",
        setupTitle: "Einrichtung in 5 Schritten",
        proTip: "Profi-Tipp",
        viewDocs: "Zur Dokumentation"
      },
      automation: {
        icon: "📅",
        title: "Post-Automatisierung",
        description: "Plane deinen gesamten Monat im Voraus – Posts werden automatisch zum besten Zeitpunkt veröffentlicht",
        whatIsIt: "Was ist Post-Automatisierung?",
        whatDescription: "Der Intelligente Kalender ermöglicht es dir, alle deine Social-Media-Posts Wochen oder Monate im Voraus zu planen. Stell es ein und vergiss es – deine Inhalte werden automatisch veröffentlicht, während du dich auf das Erstellen konzentrierst.",
        setupTitle: "Einrichtung in 5 Schritten",
        step1: {
          title: "Kalender öffnen",
          description: "Navigiere zum Intelligenten Kalender über die Sidebar",
          actionLabel: "Zum Kalender",
          actionLink: "/calendar"
        },
        step2: {
          title: "Ersten Post erstellen",
          description: "Klicke auf '+ Post hinzufügen' oder nutze das Quick-Add Formular. Wähle deine Plattform (Instagram, TikTok, LinkedIn, etc.)"
        },
        step3: {
          title: "Content hinzufügen",
          description: "Gib deine Caption ein oder generiere sie mit AI. Lade Medien hoch (Bild/Video)"
        },
        step4: {
          title: "Veröffentlichungszeit festlegen",
          description: "Wähle ein Datum oder nutze 'Smart Scheduler' für optimale Posting-Zeiten. Status wird automatisch auf 'Geplant' gesetzt"
        },
        step5: {
          title: "Automatische Veröffentlichung",
          description: "Dein Post wird automatisch zum festgelegten Zeitpunkt veröffentlicht. Echtzeit-Updates in der Statusübersicht"
        },
        proTip: "Nutze die Auto-Schedule Funktion, damit AI die besten Zeiten für maximales Engagement basierend auf dem Verhalten deiner Zielgruppe findet.",
        quickStartLabel: "Zum Kalender",
        quickStartLink: "/calendar",
        docsLink: "/docs/calendar"
      },
      analytics: {
        icon: "📊",
        title: "Performance Analytics",
        description: "Verstehe was funktioniert mit detaillierten Insights – optimiere deine Strategie datenbasiert",
        whatIsIt: "Was ist Performance Analytics?",
        whatDescription: "Verbinde deine Social-Media-Konten und erhalte tiefe Einblicke, welche Inhalte am besten performen. Tracke Engagement, Reichweite und Wachstum über alle Plattformen in einem Dashboard.",
        setupTitle: "Einrichtung in 5 Schritten",
        step1: {
          title: "Performance Tracker öffnen",
          description: "Navigiere zum Performance Tracker in der Sidebar",
          actionLabel: "Zum Performance Tracker",
          actionLink: "/performance"
        },
        step2: {
          title: "Konten verbinden",
          description: "Gehe zum Tab 'Verbindungen'. Klicke auf 'Verbinden' bei Instagram, TikTok, LinkedIn, X, etc. Autorisiere die App (OAuth-Flow)"
        },
        step3: {
          title: "Erste Sync durchführen",
          description: "Klicke auf 'Jetzt synchronisieren', um deine Posts zu importieren. Dies kann je nach Anzahl der Posts eine Minute dauern"
        },
        step4: {
          title: "Dashboard ansehen",
          description: "Wechsel zum Tab 'Übersicht'. Sieh Engagement-Rate, Reichweite, Top-Posts und Wachstumstrends"
        },
        step5: {
          title: "AI Insights generieren",
          description: "Gehe zum Tab 'Caption Insights'. Klicke auf 'AI-Analyse starten', um konkrete Verbesserungsvorschläge zu erhalten"
        },
        proTip: "Synchronisiere deine Posts regelmäßig (wöchentlich), um Trends über die Zeit zu verfolgen und Muster in deinen erfolgreichsten Inhalten zu erkennen.",
        quickStartLabel: "Zum Leistungstracker",
        quickStartLink: "/performance",
        docsLink: "/docs/performance"
      },
      brandKit: {
        icon: "🎨",
        title: "Brand Kit & Konsistenz",
        description: "Halte deine Markenidentität konsistent über alle Plattformen und Posts hinweg",
        whatIsIt: "Was ist Brand Kit?",
        whatDescription: "Definiere deine Brand Voice, Werte und visuelle Identität einmal – dann passt sich jeder AI-generierte Post automatisch deinem einzigartigen Stil an. Keine inkonsistenten Botschaften mehr.",
        setupTitle: "Einrichtung in 5 Schritten",
        step1: {
          title: "Brand Kit erstellen",
          description: "Navigiere zu Brand Kit in der Sidebar. Nutze den Onboarding-Wizard für Unterstützung",
          actionLabel: "Zum Brand Kit",
          actionLink: "/brand-kit"
        },
        step2: {
          title: "Grundinformationen eingeben",
          description: "Definiere Markenname, Zielgruppe und Kernwerte"
        },
        step3: {
          title: "Brand Voice analysieren",
          description: "Füge 3-5 Beispiel-Captions ein, die deinen Stil repräsentieren. Klicke auf 'Stimme analysieren' und AI erstellt dein Markenprofil"
        },
        step4: {
          title: "Logo hochladen (Optional)",
          description: "Lade dein Logo hoch für automatische Farbpaletten-Extraktion und visuelle Konsistenz"
        },
        step5: {
          title: "Brand Kit aktivieren",
          description: "Alle generierten Posts nutzen jetzt automatisch deine Brand Voice. Konsistenz-Score wird getrackt"
        },
        proTip: "Aktualisiere dein Brand Kit quartalsweise, während sich deine Marke entwickelt. Die AI lernt aus deinen neuesten Posts, um aktuell zu bleiben.",
        quickStartLabel: "Brand Kit erstellen",
        quickStartLink: "/brand-kit"
      },
      coach: {
        icon: "🤖",
        title: "AI Content Coach",
        description: "Erhalte Echtzeit-Feedback zu Captions, Hashtags und Posting-Zeiten – wie ein persönlicher Social-Media-Manager",
        whatIsIt: "Was ist AI Content Coach?",
        whatDescription: "Dein 24/7 Social-Media-Stratege. Stelle Fragen, lass Content prüfen, lerne Best Practices und erhalte personalisierte Ratschläge basierend auf deinen Performance-Daten.",
        setupTitle: "Einrichtung in 5 Schritten",
        step1: {
          title: "Coach öffnen",
          description: "Navigiere zum AI Coach in der Sidebar",
          actionLabel: "Zum Coach",
          actionLink: "/coach"
        },
        step2: {
          title: "Brand Kit verknüpfen (Empfohlen)",
          description: "Wähle dein aktives Brand Kit für personalisierte Empfehlungen, die zu deiner Stimme passen"
        },
        step3: {
          title: "Erste Frage stellen",
          description: "Probiere: 'Wie kann ich bessere Instagram Captions schreiben?' Coach analysiert deine bisherigen Posts für Kontext"
        },
        step4: {
          title: "Content-Review anfordern",
          description: "Füge eine Caption für Echtzeit-Feedback zu Ton, Hashtags, CTA und Engagement-Potenzial ein"
        },
        step5: {
          title: "Wöchentliche Reports aktivieren (Optional)",
          description: "Aktiviere in Einstellungen → Benachrichtigungen, um wöchentliche Performance-Zusammenfassungen und Tipps zu erhalten"
        },
        proTip: "Nutze den Coach vor dem Veröffentlichen! Füge deinen Entwurf ein und frage 'Wird das gut performen?' für prädiktive Insights.",
        quickStartLabel: "Mit Coach chatten",
        quickStartLink: "/coach"
      },
      publishing: {
        icon: "⚡",
        title: "Multi-Platform Publishing",
        description: "Veröffentliche gleichzeitig auf Instagram, TikTok, LinkedIn, X und YouTube – mit einem Klick",
        whatIsIt: "Was ist Multi-Platform Publishing?",
        whatDescription: "Einmal erstellen, überall veröffentlichen. Der Composer zeigt plattformspezifische Vorschauen in Echtzeit und passt deinen Content (Caption-Länge, Hashtags, Format) für jedes Netzwerk an.",
        setupTitle: "Einrichtung in 5 Schritten",
        step1: {
          title: "Composer öffnen",
          description: "Navigiere zum Composer in der Sidebar",
          actionLabel: "Zum Composer",
          actionLink: "/composer"
        },
        step2: {
          title: "Plattformen auswählen",
          description: "Wähle Instagram, TikTok, LinkedIn, X, YouTube Shorts. Sieh plattformspezifische Vorschau in Echtzeit"
        },
        step3: {
          title: "Content erstellen",
          description: "Schreibe deine Caption oder generiere sie mit AI. Lade Medien hoch (Bild/Video)"
        },
        step4: {
          title: "Plattform-spezifische Anpassungen",
          description: "Passe Caption-Länge für X an. Hashtag-Vorschläge für Instagram. Video-Format-Check für TikTok/Shorts"
        },
        step5: {
          title: "Sofort veröffentlichen oder planen",
          description: "Klicke 'Jetzt veröffentlichen' für Instant-Post oder 'Planen', um zum Kalender hinzuzufügen"
        },
        proTip: "Nutze die plattformspezifische Vorschau, um sicherzustellen, dass dein Video auf jeder Plattform perfekt aussieht, bevor du veröffentlichst.",
        quickStartLabel: "Neuen Post erstellen",
        quickStartLink: "/composer"
      },
      goals: {
        icon: "📈",
        title: "Ziele verfolgen & Achievements",
        description: "Setze Content-Ziele, tracke Fortschritt und erreiche Meilensteine mit motivierenden Achievements",
        whatIsIt: "Was ist Goal Tracking?",
        whatDescription: "Setze SMART-Ziele (Follower, Posts pro Monat, Engagement-Rate, Umsatz) und tracke den Fortschritt automatisch. Schalte Achievements frei und bleibe motiviert mit Gamification.",
        setupTitle: "Einrichtung in 5 Schritten",
        step1: {
          title: "Goals Dashboard öffnen",
          description: "Navigiere zum Goals Dashboard in der Sidebar",
          actionLabel: "Zu Zielen",
          actionLink: "/goals-dashboard"
        },
        step2: {
          title: "Erstes Ziel erstellen",
          description: "Klicke auf '+ Neues Ziel'. Wähle Ziel-Typ (z.B. '10.000 Follower bis Dezember')"
        },
        step3: {
          title: "Metriken definieren",
          description: "Setze Start-Wert, Ziel-Wert und Deadline. Wähle Plattform (Instagram, TikTok, etc.)"
        },
        step4: {
          title: "Fortschritt tracken",
          description: "System trackt automatisch via Performance Tracker. Manuelle Updates möglich über 'Fortschritt aktualisieren'"
        },
        step5: {
          title: "Achievements freischalten",
          description: "Erreiche Meilensteine für Badges. Teile deine Erfolge auf Social Media"
        },
        proTip: "Setze realistische quartalsweise Ziele statt jährlicher. Kleinere Erfolge halten dich motiviert und ermöglichen schnellere Strategieanpassungen.",
        quickStartLabel: "Erstes Ziel setzen",
        quickStartLink: "/goals-dashboard"
      }
    },
    
    // Goals Dashboard
    goals: {
      title: "Ziele-Dashboard",
      subtitle: "Setze und verfolge deine Social-Media-Ziele",
      activeGoals: "Aktive Ziele",
      completed: "Abgeschlossene Ziele",
      avgProgress: "Durchschnittlicher Fortschritt",
      addGoal: "Neues Ziel hinzufügen",
      createNewGoal: "Neues Ziel erstellen",
      createGoal: "Ziel erstellen",
      active: "Aktiv",
      completedTab: "Abgeschlossen",
      noActiveGoals: "Noch keine aktiven Ziele. Erstelle jetzt dein erstes Ziel!",
      noCompletedGoals: "Noch keine abgeschlossenen Ziele. Arbeite weiter an deinen Zielen!",
      motivationBanner: "Bleib dran – kleine Schritte führen zu großen Erfolgen!",
      platform: "Plattform",
      goalType: "Zieltyp",
      targetValue: "Zielwert",
      updateValue: "Wert aktualisieren",
      endDate: "Enddatum",
      optional: "optional",
      deadline: "Frist",
      success: "Erfolg",
      error: "Fehler",
      goalCreated: "Ziel erfolgreich erstellt",
      goalDeleted: "Ziel erfolgreich gelöscht",
      goalCompleted: "🎉 Ziel erreicht!",
      congratulations: "Großartige Arbeit! Du hast dein Ziel erreicht!",
      loadError: "Fehler beim Laden der Ziele",
      createError: "Fehler beim Erstellen des Ziels",
      deleteError: "Fehler beim Löschen des Ziels",
      fillAllFields: "Bitte fülle alle Pflichtfelder aus",
      limitReached: "Ziel-Limit erreicht",
      upgradeForMore: "Upgrade auf Pro für unbegrenzte Ziele",
      aiInsight: "KI-Einblick",
      saving: "Wird gespeichert...",
      save: "Speichern",
      types: {
        followers: "Follower",
        postsPerMonth: "Posts pro Monat",
        engagementRate: "Engagement-Rate",
        contentCreated: "Erstellter Content",
        revenue: "Umsatz"
      },
      filters: {
        timeframe: "Zeitraum",
        platform: "Plattform",
        all: "Alle Plattformen",
        "7days": "7 Tage",
        "30days": "30 Tage",
        "90days": "90 Tage"
      },
      kpi: {
        totalViews: "Gesamt-Aufrufe",
        totalLikes: "Gesamt-Likes",
        totalComments: "Gesamt-Kommentare",
        avgEngagement: "Ø Engagement"
      },
      metrics: {
        title: "Content-Performance",
        addMetrics: "Metriken hinzufügen",
        content: "Inhalt",
        views: "Aufrufe",
        likes: "Likes",
        comments: "Kommentare",
        shares: "Shares",
        engagementRate: "Engagement-Rate",
        caption: "Caption",
        captionPlaceholder: "Post-Titel oder Beschreibung...",
        captionRequired: "Caption wird benötigt",
        postedAt: "Veröffentlicht am",
        saved: "Metriken erfolgreich gespeichert",
        saveError: "Fehler beim Speichern der Metriken",
        noData: "Noch keine Daten. Füge deine ersten Post-Metriken hinzu!"
      },
      charts: {
        engagementTrend: "Engagement-Trend",
        platformComparison: "Plattform-Vergleich",
        engagementRate: "Engagement-Rate",
        posts: "Posts",
        avgEngagement: "Ø Engagement (%)"
      },
      trends: {
        title: "Performance-Trends",
        engagement: "Engagement-Veränderung",
        bestTimes: "Beste Posting-Zeiten"
      },
      recommendations: {
        title: "KI-Empfehlungen",
        noData: "Noch nicht genug Daten für Empfehlungen",
        addMoreData: "Füge mehr Posts hinzu für personalisierte Insights"
      },
      quickWins: {
        title: "Quick Wins"
      },
      achievements: {
        title: "Erfolge",
        consistencyStreak: "Konsistenz-Serie",
        monthlyPosts: "Monatliche Posts",
        engagementHero: "Engagement-Held",
        goalCompleter: "Ziel-Erreicher",
        days: "Tage",
        posts: "Posts",
        completed: "abgeschlossen",
        unlocked: "Freigeschaltet ✓",
        locked: "Gesperrt",
        earned: "Verdient",
        motivationText: "Erstelle weiter Content und erreiche deine Ziele, um mehr Erfolge freizuschalten!"
      }
    },
    
    // Onboarding
    onboarding: {
      welcome: {
        title: "Willkommen bei AdTool AI!",
        description: "Dein Dashboard zeigt alle Aktivitäten und Insights auf einen Blick"
      },
      features: {
        title: "Funktionen entdecken",
        description: "Durchstöbere unsere KI-Tools, organisiert nach Kategorien"
      },
      generator: {
        title: "Erstelle deine erste Caption",
        description: "Starte mit unserem KI-Caption-Generator – dein meistgenutztes Tool"
      },
      performance: {
        title: "Verfolge deinen Erfolg",
        description: "Überwache deine Post-Performance und erhalte KI-Insights"
      },
      back: "Zurück",
      next: "Weiter",
      finish: "Loslegen",
      modal: {
        title: "Willkommen bei AdTool AI!",
        subtitle: "Deine KI-gestützte Social Media Management Plattform",
        feature1: {
          title: "KI-Content-Erstellung",
          description: "Generiere Captions, Hooks und Skripte sofort"
        },
        feature2: {
          title: "Performance-Analysen",
          description: "Verfolge und optimiere deinen Social-Media-Erfolg"
        },
        feature3: {
          title: "Smart Scheduling",
          description: "Plane und organisiere deinen Content-Kalender"
        },
        feature4: {
          title: "Markenkonsistenz",
          description: "Bewahre deine einzigartige Stimme auf allen Plattformen"
        },
        skip: "Tour überspringen",
        startTour: "Schnelle Tour starten"
      }
    },
    
    // Command Palette
    commandPalette: {
      placeholder: "Nach Funktionen suchen...",
      noResults: "Keine Ergebnisse gefunden"
    },
    
    // Calendar (Enterprise)
    calendar: {
      // Scope Switcher
      workspace: "Workspace",
      client: "Mandant",
      brand: "Marke",
      selectWorkspace: "Workspace auswählen",
      selectClient: "Mandant auswählen",
      selectBrand: "Marke auswählen",
      allClients: "Alle Mandanten",
      allBrands: "Alle Marken",
      
      // Views
      views: {
        month: "Monat",
        week: "Woche",
        list: "Liste",
        kanban: "Kanban",
        timeline: "Zeitleiste"
      },
      
      // Status
      status: {
        briefing: "Briefing",
        in_progress: "In Arbeit",
        review: "Review",
        pending_approval: "Zur Freigabe",
        approved: "Freigegeben",
        scheduled: "Geplant",
        published: "Live",
        cancelled: "Abgebrochen"
      },
      
      // Actions
      actions: {
        createEvent: "Beitrag erstellen",
        addNote: "Notiz hinzufügen",
        autoSchedule: "Auto-Planen",
        manageIntegrations: "Integrationen verwalten",
        sendForApproval: "Zur Freigabe senden",
        duplicate: "Duplizieren",
        exportPDF: "PDF exportieren",
        exportCSV: "CSV exportieren",
        exportICS: "ICS exportieren",
        filter: "Filtern",
        share: "Teilen",
        settings: "Einstellungen",
        bulkEdit: "Massenbearbeitung",
        bulkDelete: "Alle löschen",
        bulkMove: "Verschieben",
        bulkChangeStatus: "Status ändern",
        clearSelection: "Auswahl aufheben"
      },
      
      // Integrations
      integrations: {
        title: "Kalender-Integrationen",
        googleCalendar: "Google Calendar",
        slack: "Slack-Benachrichtigungen",
        discord: "Discord-Benachrichtigungen",
        notifications: "Benachrichtigungen"
      },
      
      // Event Card / Drawer
      event: {
        title: "Titel",
        channels: "Kanäle",
        status: "Status",
        publishTime: "Veröffentlichungszeit",
        timezone: "Zeitzone",
        owner: "Verantwortlich",
        assignees: "Zugewiesen an",
        campaign: "Kampagne",
        tags: "Tags",
        brief: "Briefing",
        assets: "Assets",
        hashtags: "Hashtags",
        versions: "Versionen",
        comments: "Kommentare",
        tasks: "Aufgaben",
        approval: "Freigabe",
        created: "Erstellt",
        updated: "Aktualisiert",
        publishedAt: "Veröffentlicht am",
        noTitle: "Ohne Titel"
      },
      
      // Capacity Planning
      capacity: {
        available: "Verfügbar",
        planned: "Geplant",
        overbooked: "Überlastet",
        hours: "Stunden",
        warning: "Kapazitätswarnung",
        teamUtilization: "Team-Auslastung",
        weeklyCapacity: "Wöchentliche Kapazität"
      },
      
      // Filters
      filters: {
        all: "Alle",
        channel: "Kanal",
        status: "Status",
        campaign: "Kampagne",
        owner: "Verantwortlich",
        dateRange: "Zeitraum",
        clearAll: "Alle löschen"
      },
      
      // Messages & Toasts
      messages: {
        eventCreated: "Event erfolgreich erstellt",
        eventUpdated: "Event aktualisiert",
        eventDeleted: "Event gelöscht",
        eventMoved: "Event verschoben",
        approvalSent: "Zur Freigabe gesendet",
        approvalApproved: "Erfolgreich freigegeben",
        approvalRejected: "Änderungen angefordert",
        capacityExceeded: "Team-Kapazität überschritten",
        blackoutDate: "Dieser Tag ist gesperrt",
        copySuccess: "Link kopiert",
        exportSuccess: "Export erfolgreich",
        loadFailed: "Events konnten nicht geladen werden",
        moveFailed: "Verschieben fehlgeschlagen",
        statusFailed: "Status-Aktualisierung fehlgeschlagen",
        statusUpdated: "Status aktualisiert",
        noEventsToExport: "Keine Events zum Exportieren",
        pdfPrintDialog: "Öffne Druck-Dialog für PDF-Export...",
        saving: "Speichern...",
        createEventComingSoon: "Event-Erstellung kommt bald",
        addNoteComingSoon: "Notiz hinzufügen kommt bald",
        filterComingSoon: "Filter-Funktion kommt bald",
        shareComingSoon: "Teilen-Funktion kommt bald",
        workspaceCreated: "Workspace erfolgreich erstellt",
        defaultWorkspace: "Mein Workspace"
      },
      
      // Export options
      export: {
        csv: "CSV-Export",
        pdf: "PDF-Export",
        ics: "ICS-Kalenderexport",
        metrics: "Metriken-CSV"
      },
      
      // Empty States
      empty: {
        noEvents: "Keine Events vorhanden",
        noEventsDesc: "Erstellen Sie Ihr erstes Event",
        noWorkspace: "Kein Workspace ausgewählt",
        noWorkspaceDesc: "Bitte wählen Sie einen Workspace",
        noResults: "Keine Ergebnisse",
        noResultsDesc: "Versuchen Sie andere Filter",
        workspaceRequired: "Workspace erforderlich",
        workspaceRequiredDesc: "Der Content Calendar organisiert Ihre Beiträge in Workspaces. Erstellen Sie einen Workspace, um loszulegen.",
        createWorkspace: "Workspace erstellen",
        workspaceInfo: "Workspaces ermöglichen Team-Zusammenarbeit und organisieren Ihre Content-Planung"
      },
      
      // Tasks
      tasks: {
        title: "Aufgaben",
        createTask: "Aufgabe erstellen",
        taskTitle: "Aufgaben-Titel",
        description: "Beschreibung",
        priorityLabel: "Priorität",
        dueDate: "Fällig am",
        assignTo: "Zuweisen an",
        status: {
          todo: "Zu erledigen",
          in_progress: "In Arbeit",
          done: "Erledigt",
          cancelled: "Abgebrochen"
        },
        priority: {
          low: "Niedrig",
          medium: "Mittel",
          high: "Hoch"
        }
      },
      
      // Approval / Review
      approval: {
        title: "Freigabe",
        sendForReview: "Zur Freigabe senden",
        reviewLink: "Review-Link",
        createReviewLink: "Review-Link erstellen",
        copyLink: "Link kopieren",
        approverEmail: "Freigeber E-Mail",
        message: "Nachricht",
        approve: "Freigeben",
        requestChanges: "Änderungen anfordern",
        comment: "Kommentar",
        reviewExpires: "Link läuft ab",
        pending: "Ausstehend",
        approved: "Freigegeben",
        changesRequested: "Änderungen angefordert"
      },
      
      // Campaigns
      campaigns: {
        title: "Kampagnen",
        createCampaign: "Kampagne erstellen",
        selectTemplate: "Vorlage auswählen",
        generateFromTemplate: "Aus Vorlage generieren",
        noCampaign: "Keine Kampagne"
      },
      
      // Create Event Dialog
      create: {
        title: "Event erstellen",
        stepBasics: "Basis",
        stepPlanning: "Planung",
        stepContent: "Content",
        stepTeam: "Team",
        eventTitle: "Titel",
        eventBrief: "Briefing",
        selectClient: "Kunde auswählen",
        selectBrand: "Marke auswählen",
        selectCampaign: "Kampagne auswählen",
        selectStatus: "Status auswählen",
        selectChannels: "Kanäle auswählen",
        startDateTime: "Startzeit",
        endDateTime: "Endzeit (optional)",
        timezone: "Zeitzone",
        caption: "Caption",
        hashtags: "Hashtags",
        tags: "Tags",
        selectOwner: "Verantwortlicher",
        selectAssignees: "Zugewiesen an",
        estimatedMinutes: "Geschätzte Dauer (Min)",
        back: "Zurück",
        next: "Weiter",
        saveAsDraft: "Als Entwurf speichern",
        createEvent: "Event erstellen",
        titleRequired: "Titel ist erforderlich",
        channelRequired: "Mind. 1 Kanal auswählen",
        eventCreated: "Event erstellt",
        eventCreationFailed: "Event-Erstellung fehlgeschlagen"
      },
      
      // Timeline View
      timeline: {
        campaigns: "Kampagnen",
        noCampaign: "Keine Kampagne",
        noPosts: "Keine Beiträge in diesem Monat"
      },
      
      // Modal: Add Post
      addPost: {
        title: "Beitrag hinzufügen",
        editPost: "Beitrag bearbeiten",
        platform: "Plattform",
        caption: "Caption",
        captionPlaceholder: "Schreiben Sie hier Ihre Caption...",
        status: "Status",
        scheduleDate: "Geplantes Datum",
        time: "Uhrzeit",
        pickDate: "Datum wählen",
        tags: "Tags (Optional)",
        tagsPlaceholder: "#marketing, #socialmedia",
        suggestedTime: "Beste Zeit empfohlen für",
        delete: "Löschen",
        cancel: "Abbrechen",
        save: "Speichern",
        saving: "Wird gespeichert...",
        captionRequired: "Caption ist erforderlich",
        captionTooLong: "Caption überschreitet {limit} Zeichen-Limit für {platform}",
        postCreated: "Beitrag erstellt",
        postUpdated: "Beitrag aktualisiert",
        postDeleted: "Beitrag gelöscht",
        saveFailed: "Speichern fehlgeschlagen",
        deleteFailed: "Löschen fehlgeschlagen",
        draft: "Entwurf",
        scheduled: "Geplant",
        posted: "Veröffentlicht"
      },
      
      // Modal: Add Note
      addNote: {
        title: "Notiz hinzufügen",
        date: "Datum",
        noDateSelected: "Kein Datum ausgewählt",
        noteText: "Notiz",
        notePlaceholder: "z.B. Video drehen für Montag-Post",
        cancel: "Abbrechen",
        save: "Speichern",
        saving: "Wird gespeichert...",
        noteRequired: "Notiztext ist erforderlich",
        dateRequired: "Bitte wählen Sie ein Datum",
        noteCreated: "Notiz erstellt",
        saveFailed: "Speichern fehlgeschlagen"
      },
      
      // Event Drawer
      drawer: {
        eventDetails: "Event-Details",
        details: "Details",
        tasks: "Aufgaben",
        comments: "Kommentare",
        approval: "Freigabe",
        briefPlaceholder: "Content-Brief, Ziele, Zielgruppe...",
        captionPlaceholder: "Post-Caption...",
        scheduledTime: "Geplante Zeit",
        notScheduled: "Nicht geplant",
        duplicate: "Duplizieren",
        requestApproval: "Freigabe anfragen",
        delete: "Löschen",
        updateFailed: "Aktualisierung fehlgeschlagen",
        eventUpdated: "Event aktualisiert",
        duplicateFailed: "Duplizierung fehlgeschlagen",
        eventDuplicated: "Event dupliziert",
        deleteFailed: "Löschen fehlgeschlagen",
        eventDeleted: "Event gelöscht",
        loadFailed: "Laden fehlgeschlagen",
        approvalDesc: "Senden Sie dieses Event zur Freigabe durch Erstellen eines Review-Links.",
        createApprovalRequest: "Freigabeanfrage erstellen"
      },
      
      // Auto-Schedule
      autoSchedule: {
        title: "Auto-Planung",
        description: "KI schlägt optimale Zeitslots vor",
        analyze: "Analysieren",
        suggestions: "Vorschläge",
        applyAll: "Alle übernehmen",
        bestTime: "Beste Zeit",
        reason: "Begründung",
        score: "Score"
      },
      
      // Holiday Suggestions
      holidays: {
        title: "Feiertags-Vorschläge",
        subtitle: "KI-gestützte Content-Ideen für kommende Feiertage",
        selectMonth: "Monat auswählen",
        selectRegion: "Region",
        generate: "Ideen generieren",
        generating: "Analysiere Feiertage...",
        createEvent: "Event erstellen",
        noHolidays: "Keine Feiertage für diesen Zeitraum gefunden",
        success: "Feiertags-Vorschläge geladen",
        error: "Fehler beim Laden der Feiertage",
        contentIdeas: "Content-Ideen",
        regions: {
          de: "Deutschland",
          en: "Vereinigtes Königreich",
          es: "Spanien"
        }
      },
      
      // Blackout Dates
      blackout: {
        title: "Sperrtermine",
        addDate: "Termin hinzufügen",
        date: "Datum",
        reason: "Grund",
        note: "Notiz",
        allDay: "Ganztägig"
      },
      
      // Comments
      comments: {
        title: "Kommentare",
        addComment: "Kommentar hinzufügen",
        reply: "Antworten",
        mentionUser: "User erwähnen (@)",
        noComments: "Noch keine Kommentare"
      },
      
      // Toolbar
      toolbar: {
        today: "Heute",
        previousMonth: "Vorheriger Monat",
        nextMonth: "Nächster Monat",
        previousWeek: "Vorherige Woche",
        nextWeek: "Nächste Woche"
      },
      
      // Mobile
      mobile: {
        viewSelector: "Ansicht",
        moreActions: "Mehr Aktionen",
        events: "Events"
      },
      
      // API Messages
      api: {
        errors: {
          UNAUTHORIZED: "Nicht autorisiert",
          MISSING_REQUIRED_FIELDS: "Erforderliche Felder fehlen",
          TEMPLATE_NOT_FOUND: "Vorlage nicht gefunden",
          NO_DRAFTS_AVAILABLE: "Keine Entwürfe verfügbar",
          NO_POSTS_IN_RANGE: "Keine Posts im Zeitraum",
          POST_NOT_FOUND: "Post nicht gefunden",
          SCHEDULE_CONFLICT: "Zeitplan-Konflikt",
          CAPACITY_EXCEEDED: "Kapazität überschritten",
          GENERATION_FAILED: "Generierung fehlgeschlagen",
          EXPORT_FAILED: "Export fehlgeschlagen",
          INTERNAL_ERROR: "Interner Fehler"
        },
        success: {
          POSTS_SCHEDULED: "{count} Posts geplant",
          SCHEDULE_APPLIED: "Zeitplan angewendet",
          CAMPAIGN_CREATED: "Kampagne mit {count} Events erstellt",
          EVENT_RESCHEDULED: "Event neu geplant",
          EXPORT_READY: "Export bereit"
        },
        timeQuality: {
          BEST_TIME: "Beste Zeit",
          GOOD_TIME: "Gute Zeit",
          PRIME_TIME: "Optimale Engagement-Zeit",
          AVOIDING_CONFLICT: "Konflikt vermieden",
          BLACKOUT_AVOIDED: "Blackout umgangen"
        }
      }
    },
    
    // Analytics
    analytics: {
      unified: {
        title: "Analytics Dashboard",
        subtitle: "Umfassende Insights über alle Plattformen",
        tabs: {
          overview: "Übersicht",
          performance: "Performance",
          topContent: "Top Content",
          hashtags: "Hashtags",
          campaigns: "Kampagnen",
          reports: "Berichte"
        }
      },
      totalContent: "Gesamt erstellter Content",
      totalContentDesc: "Posts und Hooks generiert",
      thisWeek: "Diese Woche",
      vsLastWeek: "vs letzte Woche",
      goalsAchieved: "Erreichte Ziele",
      goalsAchievedDesc: "Abgeschlossene Meilensteine",
      streak: "Aktive Serie",
      days: "Tage",
      streakDesc: "Weiter so!",
      performanceInsight: "Performance-Einblick",
      engagementRateMessage: "Deine Posts erzielen durchschnittlich {rate}% Engagement auf {platform}. Großartige Arbeit!",
      title: "Erweiterte Analysen",
      subtitle: "Tiefe Einblicke in deine Content-Performance",
      hashtags: "Hashtag-Analysen",
      bestContent: "Bester Content",
      roi: "Kampagnen-ROI",
      reports: "Berichte",
      scheduled: "Geplant",
      hashtagPerformance: "Hashtag-Performance",
      hashtagDescription: "Verfolge, welche Hashtags die meiste Interaktion erzeugen",
      analyzeNow: "Jetzt analysieren",
      posts: "Beiträge",
      reach: "Reichweite",
      engagement: "Interaktion",
      topPerformingContent: "Top-performender Content",
      bestContentDescription: "Deine erfolgreichsten Beiträge basierend auf Interaktion",
      identifyBest: "Beste identifizieren",
      score: "Punktzahl",
      campaignROI: "Kampagnen-ROI-Tracking",
      roiDescription: "Überwache die Kapitalrendite deiner Kampagnen",
      noCampaigns: "Noch keine Kampagnen verfolgt",
      ongoing: "Laufend",
      hashtagAnalysisComplete: "Hashtag-Analyse abgeschlossen",
      hashtagsAnalyzed: "Hashtags analysiert",
      analysisComplete: "Analyse abgeschlossen",
      postsAnalyzed: "Beiträge analysiert",
      reportBuilder: "Berichts-Generator",
      builderDescription: "Erstelle benutzerdefinierte Analyseberichte",
      createTemplate: "Vorlage erstellen",
      newTemplate: "Neue Berichtsvorlage",
      templateDescription: "Konfiguriere deine benutzerdefinierte Berichtsvorlage",
      templateName: "Vorlagenname",
      templateNamePlaceholder: "z.B. Monatlicher Performance-Bericht",
      description: "Beschreibung",
      descriptionPlaceholder: "Beschreibe, was dieser Bericht enthält",
      dateRange: "Zeitraum",
      last7Days: "Letzte 7 Tage",
      last30Days: "Letzte 30 Tage",
      last90Days: "Letzte 90 Tage",
      platforms: "Plattformen",
      sections: "Abschnitte",
      metrics: "Metriken",
      includeLogo: "Logo einschließen",
      templateCreated: "Vorlage erstellt",
      templateCreatedDescription: "Deine Berichtsvorlage ist einsatzbereit",
      generatingReport: "Bericht wird erstellt",
      pleaseWait: "Bitte warten...",
      reportGenerated: "Bericht erstellt",
      reportReady: "Dein Bericht kann heruntergeladen werden",
      generatePDF: "PDF erstellen",
      generateCSV: "CSV exportieren",
      scheduledReports: "Geplante Berichte",
      scheduledDescription: "Automatisiere die Berichtszustellung per E-Mail",
      scheduleNew: "Neu planen",
      newSchedule: "Neuer Berichtszeitplan",
      scheduleFormDescription: "Konfiguriere die automatische Berichtszustellung",
      scheduleName: "Zeitplanname",
      scheduleNamePlaceholder: "z.B. Wöchentlicher Team-Bericht",
      template: "Vorlage",
      selectTemplate: "Wähle eine Vorlage",
      frequency: "Häufigkeit",
      daily: "Täglich",
      weekly: "Wöchentlich",
      monthly: "Monatlich",
      recipients: "Empfänger",
      recipientsHelp: "Trenne mehrere E-Mails mit Kommas",
      firstSendDate: "Erstes Sendedatum",
      schedule: "Planen",
      scheduleCreated: "Zeitplan erstellt",
      scheduleCreatedDescription: "Berichte werden automatisch gesendet",
      scheduleUpdated: "Zeitplan aktualisiert",
      statusUpdated: "Status erfolgreich aktualisiert",
      scheduleDeleted: "Zeitplan gelöscht",
      scheduleDeletedDescription: "Automatische Berichte abgebrochen",
      nextSend: "Nächstes Senden",
      lastSent: "Zuletzt gesendet",
      active: "Aktiv",
      paused: "Pausiert"
    },
    
    scheduler: {
      title: "Intelligenter Planer",
      subtitle: "Automatisiere wiederkehrende Posts und Batch-Scheduling",
      createRecurring: "Wiederkehrenden Post erstellen",
      newRecurringPost: "Neuer wiederkehrender Post",
      formDescription: "Richte einen Post ein, der automatisch nach einem Zeitplan veröffentlicht wird",
      titlePlaceholder: "z.B. Montags-Motivation",
      caption: "Beschriftung",
      captionPlaceholder: "Schreibe deine Post-Beschriftung...",
      platform: "Plattform",
      frequency: "Häufigkeit",
      daily: "Täglich",
      weekly: "Wöchentlich",
      biweekly: "Alle 2 Wochen",
      monthly: "Monatlich",
      firstPostTime: "Erste Post-Zeit",
      create: "Wiederkehrenden Post erstellen",
      active: "Aktiv",
      paused: "Pausiert",
      lastPosted: "Zuletzt veröffentlicht",
      postCreated: "Wiederkehrender Post erstellt",
      postCreatedDescription: "Dein Post wird automatisch veröffentlicht",
      updated: "Aktualisiert",
      statusUpdated: "Post-Status aktualisiert",
      deleted: "Gelöscht",
      postDeleted: "Wiederkehrender Post gelöscht",
      recurringPosts: "Wiederkehrende Posts",
      postQueue: "Post-Warteschlange",
      queueDescription: "Verwalte deine geplanten Posts",
      noQueuedPosts: "Keine Posts in der Warteschlange",
      queueItemDeleted: "Warteschlangenelement gelöscht",
      queueItemDeletedDescription: "Der Post wurde aus der Warteschlange entfernt",
      retry: "Wiederholen",
      retryScheduled: "Wiederholung geplant",
      retryScheduledDescription: "Der fehlgeschlagene Post wird wiederholt",
      status: {
        pending: "Ausstehend",
        completed: "Abgeschlossen",
        failed: "Fehlgeschlagen"
      }
    },
    
    // Top level
    home: "Startseite",
    "pricing.title": "Einfache & Transparente Preise",
    "pricing.subtitle": "Wähle den Plan, der zu deinem Workflow passt. Kostenlos starten, jederzeit upgraden.",
    "pricing.free": "Kostenlos",
    "pricing.freePrice": "€0",
    "pricing.freeDesc": "Perfekt zum Ausprobieren von CaptionGenie",
    "pricing.freeFeature1": "20 KI-Captions pro Monat",
    "pricing.freeFeature2": "Basis-Templates",
    "pricing.freeFeature3": "Community-Support",
    "pricing.tryFree": "Kostenlos starten",
    "pricing.proMonthly": "Basic",
    "pricing.proYearly": "Pro",
    "pricing.month": "Monat",
    "pricing.year": "Monat",
    "pricing.cancelAnytime": "Am beliebtesten",
    "pricing.saveFortyTwo": "Für Power-User",
    "pricing.proFeature1": "200 KI-Captions pro Monat",
    "pricing.proFeature2": "Alle Premium-Templates",
    "pricing.proFeature3": "Hashtag-Generator",
    "pricing.proFeature4": "Bis zu 2 Marken verwalten",
    "pricing.proFeature5": "Prioritäts-E-Mail-Support",
    "pricing.startNow": "Auf Basic upgraden",
    "pricing.benefit1": "Jederzeit kündbar",
    "pricing.benefit2": "Sicher via Stripe",
    "pricing.benefit3": "In 60 Sekunden startklar",
    
    pricingDetails: {
      header: {
        badge: "Einfache & Transparente Preise",
        title: "Wachse mit CaptionGenie",
        subtitle: "Wähle den Plan, der zu deinem Workflow passt. Kostenlos starten, jederzeit upgraden.",
      },
      period: "Monat",
      popularBadge: "BELIEBT",
      loading: "Wird geladen...",
      plans: {
        free: {
          title: "Kostenlos",
          subtitle: "Erste Schritte",
          description: "Perfekt zum Ausprobieren von CaptionGenie",
          buttonText: "Kostenlos starten",
          features: [
            "20 KI-Captions pro Monat",
            "Basis-Templates",
            "Community-Support",
            "Hashtag-Vorschläge",
            "Marken-Verwaltung",
            "Analytics",
            "Wasserzeichen auf Exporten",
          ],
        },
        basic: {
          title: "Basic",
          subtitle: "Am beliebtesten",
          description: "Am besten für Content-Creator & kleine Unternehmen",
          buttonText: "Auf Basic upgraden",
          features: [
            "200 KI-Captions pro Monat",
            "Alle Premium-Templates",
            "Hashtag-Generator",
            "Bis zu 2 Marken verwalten",
            "Wasserzeichen entfernen",
            "Prioritäts-E-Mail-Support",
            "Analytics-Dashboard",
            "Team-Zusammenarbeit",
          ],
        },
        pro: {
          title: "Pro",
          subtitle: "Für Power-User",
          description: "Perfekt für Agenturen & Teams",
          buttonText: "Pro werden",
          features: [
            "Unbegrenzte KI-Captions",
            "Unbegrenzte Marken",
            "Erweiterte KI-Modelle",
            "Team-Kollaborationstools",
            "Analytics-Dashboard",
            "White-Label-Exporte",
            "Prioritäts-Support & Onboarding",
            "Individuelle Integrationen",
          ],
        },
      },
      custom: {
        title: "Brauchst du einen individuellen Plan?",
        description: "Wir bieten maßgeschneiderte Lösungen für Unternehmen und große Teams.",
        contact: "Kontaktiere uns unter bestofproducts4u@gmail.com",
      },
      errors: {
        checkoutFailed: "Checkout konnte nicht gestartet werden",
      },
    },
    
    pricingPage: {
      title: "Einfache & Transparente Preise",
      subtitle: "Wähle den Plan, der zu deinem Workflow passt. Kostenlos starten, jederzeit upgraden.",
      plans: {
        basic: {
          name: "Basic",
          price: "14,99",
          currency: "€",
          period: "Monat",
          credits: "800 Credits",
          description: "Perfekt für Content-Creator und kleine Unternehmen",
          features: [
            "Alle Premium-Templates",
            "Hashtag-Generator",
            "Bis zu 2 Marken verwalten",
            "Wasserzeichen entfernen",
            "Manuelle Post-Planung",
            "Prioritäts-E-Mail-Support",
            "Analytics-Dashboard"
          ],
          button: "Auf Basic upgraden"
        },
        pro: {
          name: "Pro",
          price: "34,99",
          currency: "€",
          period: "Monat",
          credits: "2.500 Credits",
          description: "Am besten für Agenturen und Teams",
          features: [
            "Alles aus Basic",
            "KI Auto-Planung",
            "Erweiterte KI-Modelle",
            "Team-Kollaborationstools",
            "Analytics-Dashboard",
            "White-Label-Exporte",
            "Prioritäts-Support & Onboarding"
          ],
          button: "Auf Pro upgraden"
        },
        enterprise: {
          name: "Enterprise",
          price: "69,99",
          currency: "€",
          period: "Monat",
          credits: "Unbegrenzte Credits",
          description: "Für große Teams und Agenturen",
          features: [
            "Alles aus Pro",
            "API- und Integrationszugang",
            "Prioritäts-Support",
            "Agentur-Tools & White-Labeling",
            "Individuelle Integrationen",
            "Dedizierter Account-Manager"
          ],
          button: "Auf Enterprise upgraden"
        }
      }
    },
    
    pricing: {
      promo: {
        placeholder: "Promo-Code eingeben",
        apply: "Anwenden",
        invalid: "Ungültiger Promo-Code",
        error: "Fehler beim Validieren des Codes",
        applied: "Code angewendet",
        for3months: "für 3 Monate",
        hint: "Mit Creator-Code: −30% für 3 Monate • Creator erhält 20% Provision"
      },
      intro: {
        basic: "Intro-Monat: Nur 4,99 € statt 14,99 €",
        enterprise: "Intro-Monat: Nur 9,99 € statt 69,99 €",
        monthly: "Jederzeit kündbar"
      },
      features: {
        quickPostLocked: "Schnell-Post im Kalender (Pro-Feature)",
        quickPostDesc: "Plane Posts mit einem Klick – upgrade auf Pro oder Enterprise, um diese Funktion freizuschalten.",
        autoScheduleLocked: "KI Auto-Schedule (Pro-Feature)",
        autoScheduleDesc: "Lass die KI automatisch die besten Zeiten zum Posten finden – verfügbar in Pro und Enterprise Plänen."
      },
      upgrade: {
        toPro: "Auf Pro upgraden",
        toEnterprise: "Auf Enterprise upgraden"
      }
    },
    
    faq: {
      title: "Häufig gestellte Fragen",
      questions: {
        q1: {
          question: "Was ist CaptionGenie?",
          answer: "CaptionGenie ist ein KI-Tool, das dir hilft, ansprechende, plattformoptimierte Captions für deine Social-Media-Posts zu erstellen. Es spart dir Zeit und maximiert die Reichweite deiner Inhalte."
        },
        q2: {
          question: "Wie funktioniert die KI?",
          answer: "Unsere KI analysiert deine Eingabe (Thema, Tonalität, Zielgruppe) und generiert maßgeschneiderte Captions basierend auf aktuellen Best Practices für jede Plattform. Sie lernt aus Millionen erfolgreicher Posts."
        },
        q3: {
          question: "Kann ich es kostenlos testen?",
          answer: "Ja! Wir bieten einen kostenlosen Plan mit 20 KI-generierten Captions pro Monat. Keine Kreditkarte erforderlich."
        },
        q4: {
          question: "Welche Plattformen werden unterstützt?",
          answer: "CaptionGenie unterstützt Instagram, TikTok, Facebook, LinkedIn, Twitter/X und YouTube. Jede Plattform hat ihren eigenen optimierten Caption-Stil."
        },
        q5: {
          question: "Kann ich die generierten Captions anpassen?",
          answer: "Absolut! Jede generierte Caption ist vollständig bearbeitbar. Nutze sie direkt oder passe sie an deinen einzigartigen Stil an."
        },
        q6: {
          question: "Wie kündige ich mein Abonnement?",
          answer: "Du kannst jederzeit in deinen Kontoeinstellungen kündigen. Dein Zugang bleibt bis zum Ende deines Abrechnungszeitraums bestehen."
        }
      }
    },
    backToHome: "Zurück zur Startseite",
    footer_rights: "Alle Rechte vorbehalten",
    platform: "Plattform",
    language: "Sprache",
    
    // Cookie Consent
    consent: {
      banner: {
        title: "Wir respektieren deine Privatsphäre",
        description: "Wir verwenden Cookies, um unsere Website zu verbessern, Statistiken zu führen und relevante Inhalte anzuzeigen. Du kannst deine Auswahl anpassen. Mehr in unserer Datenschutzerklärung.",
        privacyLink: "Datenschutzerklärung",
        imprintLink: "Impressum",
        ariaLabel: "Cookie-Einwilligungsbanner"
      },
      buttons: {
        acceptAll: "Alle akzeptieren",
        rejectAll: "Alle ablehnen",
        customize: "Anpassen",
        savePreferences: "Einstellungen speichern"
      },
      preferences: {
        title: "Cookie-Einstellungen",
        description: "Verwalte deine Cookie-Einstellungen. Du kannst diese jederzeit über Cookie-Einstellungen im Footer ändern."
      },
      categories: {
        necessary: {
          title: "Notwendige Cookies",
          description: "Erforderlich für Grundfunktionen (Sitzung, Sicherheit, Einwilligung).",
          examples: "Sitzungs-Cookies, Sicherheits-Token, Einwilligungs-Speicherung"
        },
        analytics: {
          title: "Statistik & Analyse",
          description: "Hilft uns zu verstehen, wie die Website genutzt wird (anonymisiert).",
          examples: "Google Analytics, Nutzungsstatistiken, Performance-Metriken"
        },
        marketing: {
          title: "Marketing & Werbung",
          description: "Zur Anzeige relevanter Angebote und Retargeting.",
          examples: "Facebook Pixel, Google Ads, Retargeting-Cookies"
        },
        comfort: {
          title: "Komfort & Personalisierung",
          description: "Zusatzfunktionen wie eingebettete Medien und Personalisierung.",
          examples: "YouTube-Einbettungen, personalisierte Inhalte, gespeicherte Präferenzen"
        }
      },
      footer: {
        linkText: "Cookie-Einstellungen"
      }
    },
    characters: "Zeichen",
    copy: "Kopieren",
    copied_to_clipboard: "In Zwischenablage kopiert",
    generating: "Wird generiert...",
    success_title: "Erfolg",
    error_title: "Fehler",
    error_auth: "Authentifizierung erforderlich",
    error_login_required: "Bitte melde dich an, um fortzufahren",
    
    // Categories
    category: {
      create: "Erstellen",
      optimize: "Optimieren",
      analyze: "Analysieren & Ziele",
      design: "Design & Visuals"
    },
    
    // Dashboard
  header: {
    brand: "AdTool AI Startseite",
    userMenu: "Benutzermenü",
    credits: "Credits",
    account: "Einstellungen",
    billing: "Abrechnung",
    support: "Support",
    logout: "Abmelden",
  },
  commandBar: {
    placeholder: "Suche oder Cmd+K",
    searchPlaceholder: "Suche nach Features, Seiten...",
    noResults: "Keine Ergebnisse gefunden.",
    hint: "Drücke Cmd+K um die Suche zu öffnen",
    other: "Andere",
  },
  dashboard: {
    statusBar: {
      tipOfTheDay: "Tipp des Tages",
      connectedAccounts: "verbunden",
      nextPost: "Nächster Post"
    },
      quickActions: {
        quickSchedule: "Schnell planen",
        openCalendar: "Kalender öffnen",
        postFromTemplate: "Post aus Vorlage",
        openPerformance: "Performance öffnen"
      },
      sections: {
        today: "Heute",
        todayDescription: "Fällige Posts für heute",
        thisWeek: "Diese Woche",
        thisWeekDescription: "Planungsübersicht für die nächsten 7 Tage",
        performance: "Performance-Überblick",
        performanceDescription: "Verfolge deine wichtigsten Metriken auf einen Blick",
        bestTimes: "Beste Posting-Zeiten",
        bestTimesDescription: "Optimale Zeiten für maximale Reichweite",
        recentActivity: "Letzte Aktivitäten",
        recentActivityDescription: "Deine jüngsten Aktionen im Überblick"
      },
      emptyState: {
        noPosts: "Keine Posts heute geplant",
        createNow: "Erstelle jetzt einen neuen Post oder nutze die Auto-Planung"
      },
      metrics: {
        reach7d: "Reichweite (7 Tage)",
        engagementRate: "Engagement-Rate",
        publishedPosts: "Veröffentlichte Posts",
        vsLastWeek: "vs. letzte Woche",
        avgAllPosts: "Durchschnitt über alle Posts",
        thisMonth: "Diesen Monat"
      },
      postActions: {
        open: "Öffnen",
        publishNow: "Jetzt veröffentlichen",
        retry: "Wiederholen"
      }
    },
  featureCards: {
    sectionTitle: "Features",
    sectionSubtitle: "Starte mit klaren Workflows – in wenigen Schritten.",
    automation: {
      title: "Post-Automatisierung",
      description: "Plane deinen Monat – automatische Veröffentlichung zum besten Zeitpunkt."
    },
    analytics: {
      title: "Performance Analytics",
      description: "Erkenne, was wirkt – detaillierte Insights für bessere Entscheidungen."
    },
    brandKit: {
      title: "Brand Kit & Konsistenz",
      description: "Schrift, Farben, Vorlagen – markenkonsistent posten."
    },
    coach: {
      title: "AI Content Coach",
      description: "Echtzeit-Feedback zu Captions, Hashtags und Tonalität."
    },
    publishing: {
      title: "Multi-Platform Publishing",
      description: "Poste gleichzeitig auf IG, TikTok, LinkedIn, X, YouTube."
    },
    goals: {
      title: "Ziele & Achievements",
      description: "Setze Social-Ziele, verfolge Fortschritt, feiere Meilensteine."
    }
  },
  heroBanner: {
    heading: "Plane, veröffentliche & analysiere Social-Posts – schneller mit KI.",
    subheading: "Starte kostenlos. Upgrade jederzeit.",
    ctaPrimary: "Schnell planen",
    ctaSecondary: "Kalender öffnen",
    stats: {
      engagement: "Engagement-Rate ↑",
      posts: "Veröffentlichte Posts",
      accounts: "Verbundene Konten"
    },
    trust: {
      title: "DSGVO-konform • Sichere Zahlung",
      subtitle: "Deine Daten sind sicher",
      integrations: "Integrationen"
    },
    footer: {
      tagline: "KI-gestütztes Social Media Management"
    },
    
    // Authentication
    auth: {
      login: "Anmelden",
      signup: "Registrieren",
      logout: "Abmelden",
      account: "Konto",
      loginTitle: "Melde dich in deinem Konto an",
      signupTitle: "Erstelle dein Konto",
      email: "E-Mail",
      password: "Passwort"
    },
    
    // Common
    common: {
      language: "de",
      error: "Fehler",
      success: "Erfolg",
      cancel: "Abbrechen",
      generating: "Wird generiert...",
      uploading: "Wird hochgeladen...",
      comingSoon: "Demnächst",
      featureComingSoon: "Diese Funktion ist demnächst verfügbar!",
      upgradeRequired: "Upgrade erforderlich",
      upgradeToPro: "Auf Pro upgraden",
      locked: "Gesperrt",
      requiresPro: "Benötigt Pro-Plan",
      getStarted: "Loslegen",
      startNow: "Jetzt starten",
      friendly: "Freundlich",
      professional: "Professionell",
      funny: "Humorvoll",
      inspirational: "Inspirierend",
      bold: "Mutig",
      emotional: "Emotional",
      informative: "Informativ",
      playful: "Verspielt",
      close: "Schließen"
    },
    
    // Hero section
    hero: {
      title: "Deine KI-gestützte Social Media Management Plattform",
      subtitle: "Erstelle, optimiere und analysiere deine Inhalte – professionell, effizient, skalierbar.",
      cta: "Kostenlos starten",
      demo: "Demo ansehen",
      login: "Anmelden",
      tryFree: "Kostenlos testen"
    },

    // UI enhancements
    ui: {
      welcome: {
        greeting: "Willkommen zurück, {name}!",
        weeklyProgress: "Du hast diese Woche {count} Inhalte erstellt. {remaining} fehlen bis zum Ziel!",
        tipOfTheDay: "Tipp des Tages",
        goal: "Fehlen bis zum Ziel!"
      },
      badge: {
        new: "Neu",
        pro: "Pro",
        cancelAnytime: "Monatlich kündbar"
      },
      category: {
        createDesc: "Verwandle Ideen in ansprechende Inhalte",
        optimizeDesc: "Verfeinere und plane deine Inhalte",
        analyzeDesc: "Verfolge Leistung und erreiche deine Ziele",
        designDesc: "Erstelle Marken-Visuals, Karussells und Bild-Captions"
      },
      trust: {
        cancelAnytime: "Monatlich kündbar",
        securePayment: "Sichere Zahlung",
        readyInSeconds: "In 60 Sekunden startklar"
      }
    },
    
    trends: {
      title: "KI-Trendradar",
      subtitle: "Entdecke virale Trends, Content-Ideen und Wachstumschancen für deine Nische",
      discover: "Entdecken",
      saved: "Gespeichert",
      discoverNiche: "Entdecke deine Nische",
      topTrends: "Top-Trends der Woche",
      topTrendsSubtitle: "Die heißesten Trends im Moment",
      allTrends: "Alle Trends",
      search: "Suchen",
      searchPlaceholder: "Trends, Hashtags, Produkte suchen...",
      ideas: "Ideen",
      viewDetails: "Details ansehen",
      analyzing: "Analysiere...",
      popularity: "Beliebtheit",
      platform: "Plattform",
      category: "Kategorie",
      allPlatforms: "Alle Plattformen",
      allCategories: "Alle Kategorien",
      niches: {
        socialMedia: "Social-Media-Wachstum",
        ecommerce: "Viral für E-Commerce",
        lifestyle: "Lifestyle & Gesundheit",
        business: "Business & KI-Tools",
        motivation: "Motivation & Bildung",
        finance: "Finanzen & Side Hustles",
      }
    },
    
    // Performance tracker
    performance: {
      title: "Leistungs-Tracker",
      subtitle: "Analysieren Sie die Leistung Ihrer Beiträge auf allen Plattformen",
      tabs: {
        overview: "Übersicht",
        trends: "Engagement-Trends",
        insights: "Caption-Einblicke",
        connections: "Verbindungen"
      },
      kpi: {
        avgEngagement: "Durchschn. Engagement-Rate",
        totalPosts: "Analysierte Beiträge",
        bestDay: "Bester Tag zum Posten",
        bestHour: "Beste Stunde zum Posten"
      },
      charts: {
        engagementOverTime: "Engagement im Zeitverlauf",
        providerDistribution: "Plattform-Verteilung",
        topPosts: "Top-Beiträge nach Engagement"
      },
      actions: {
        syncLatest: "Neueste Daten synchronisieren"
      },
      connections: {
        title: "Social-Media-Verbindungen",
        description: "Verbinden Sie Ihre Social-Media-Konten, um Leistungsdaten automatisch zu synchronisieren",
        connect: "Verbinden",
        reconnect: "Neu verbinden",
        disconnect: "Trennen",
        lastSync: "Letzte Synchronisierung",
        comingSoon: "Demnächst verfügbar",
        oauthComingSoon: "OAuth-Integration demnächst verfügbar"
      },
      csv: {
        title: "CSV-Upload",
        description: "Laden Sie Ihre Beitragsmetriken manuell per CSV-Datei hoch",
        upload: "CSV hochladen",
        uploadTitle: "Beitragsmetriken hochladen",
        uploadDescription: "Importieren Sie Leistungsdaten aus einer CSV-Datei",
        formatInfo: "CSV muss enthalten: post_id, platform, posted_at und mindestens eine Metrik",
        downloadTemplate: "Vorlage herunterladen",
        selectFile: "CSV-Datei auswählen",
        selectedFile: "Ausgewählte Datei",
        invalidFile: "Bitte wählen Sie eine gültige CSV-Datei",
        noFile: "Bitte wählen Sie zuerst eine Datei",
        noValidRows: "Keine gültigen Zeilen in CSV gefunden",
        uploadSuccess: "{count} Beiträge erfolgreich importiert"
      },
      trends: {
        dayOfWeek: "Engagement nach Wochentag",
        mediaType: "Engagement nach Medientyp",
        topPosts: "Top 20 Beiträge"
      },
      table: {
        caption: "Beschriftung",
        platform: "Plattform",
        engagement: "Engagement",
        likes: "Likes",
        comments: "Kommentare",
        date: "Datum",
        link: "Link"
      },
      insights: {
        title: "KI-Einblicke",
        subtitle: "Erhalten Sie KI-gestützte Empfehlungen zur Verbesserung Ihrer Content-Strategie",
        generate: "Neue Einblicke generieren",
        generated: "KI-Einblicke erfolgreich generiert",
        empty: "Noch keine Einblicke. Generieren Sie Ihre erste KI-Analyse.",
        generateFirst: "KI-Einblicke generieren",
        noPosts: "Keine Beiträge gefunden",
        noPostsDescription: "Laden Sie Beiträge hoch, bevor Sie Einblicke generieren",
        summary: "Leistungszusammenfassung",
        topStyles: "Beste Caption-Stile",
        bestTimes: "Optimale Posting-Zeiten",
        recommendations: "Umsetzbare Empfehlungen",
        recalculate: "Neu berechnen",
        notEnoughData: "Noch nicht genug Daten für Insights (mind. 10 Posts nötig)",
        priority: {
          high: "Wichtig",
          medium: "Mittel",
          low: "Optional"
        }
      }
    },
    
    // Calendar
    calendar_title: "Intelligenter Content-Kalender",
    calendar_add_post: "Beitrag hinzufügen",
    calendar_add_note: "Notiz hinzufügen",
    calendar_export: "In Google Kalender exportieren",
    calendar_platform: "Plattform",
    calendar_caption: "Beschriftung",
    calendar_schedule_date: "Datum & Zeit planen",
    calendar_status: "Status",
    calendar_draft: "Entwurf",
    calendar_scheduled: "Geplant",
    calendar_posted: "Veröffentlicht",
    calendar_note_text: "Notiz",
    calendar_upgrade_required: "Upgrade auf Pro, um Ihren Content-Kalender zu erstellen und zu verwalten",
    calendar_schedule_post: "Beitrag planen",
    calendar_image_upload: "Bild hochladen (Optional)",
    calendar_tags: "Tags (Optional)",
    
    // Bio Optimizer
    bio_title: "KI Bio-Optimierer",
    bio_input_audience: "Zielgruppe",
    bio_input_topic: "Thema / Nische",
    bio_input_tone: "Ton / Persönlichkeit",
    bio_input_keywords: "Keywords (Optional)",
    bio_generate: "Bio erstellen",
    bio_explanation: "Warum es funktioniert",
    bio_copy: "Bio kopieren",
    bio_preview: "Profil ansehen",
    bio_regenerate: "Neu generieren",
    bio_brand_voice: "Markenstimme",
    bio_save_brand_voice: "Markenstimme speichern",
    bio_apply_brand_voice: "Gespeicherte Markenstimme anwenden",
    bio_history_title: "Letzte Bios",
    bio_limit_reached: "Tageslimit erreicht. Upgrade auf Pro für unbegrenzte Bio-Generierung.",
    bio_tone_friendly: "Freundlich",
    bio_tone_professional: "Professionell",
    bio_tone_bold: "Mutig",
    bio_tone_humorous: "Humorvoll",
    bio_tone_inspirational: "Inspirierend",
    
    // Image Caption Pairing
    image_caption_title: "KI Bild-Caption Pairing",
    image_caption_subtitle: "Lade ein Bild hoch und erhalte KI-generierte Captions",
    upload_image: "Bild hochladen",
    drag_drop_image: "Ziehe dein Bild hierher oder klicke zum Durchsuchen",
    analyzing_image: "Bild wird analysiert...",
    generate_captions: "Captions generieren",
    generating_captions: "Captions werden generiert...",
    regenerate: "Neu generieren",
    copy_caption: "Caption kopieren",
    use_in_generator: "Im Generator verwenden",
    caption_copied: "Caption in Zwischenablage kopiert!",
    image_analysis: "Bildanalyse",
    detected_objects: "Erkannte Objekte",
    scene_type: "Szenentyp",
    emotion: "Emotion",
    theme: "Thema",
    caption_style_emotional: "Emotional",
    caption_style_funny: "Lustig",
    caption_style_minimal: "Minimal",
    caption_style_storytelling: "Storytelling",
    caption_style_engagement: "Engagement",
    upload_error: "Bild konnte nicht hochgeladen werden",
    analysis_error: "Bild konnte nicht analysiert werden",
    select_platform: "Plattform auswählen",
    history_title: "Letzte Uploads",
    no_history: "Noch keine Uploads vorhanden",
    delete_item: "Löschen",
    image_caption_limit_reached: "Tageslimit erreicht. Upgrade auf Pro für unbegrenzte Uploads.",
    max_file_size: "Maximale Dateigröße: 10 MB",
    supported_formats: "Unterstützt: JPEG, PNG, WebP",
    
    // Brand Kit
    brand_kit_title: "Automatisches Marken-Set",
    brand_kit_subtitle: "Laden Sie Ihr Logo hoch und definieren Sie Ihre Markenidentität",
    brand_kit_upload_logo: "Logo hochladen",
    brand_kit_primary_color: "Hauptfarbe",
    brand_kit_secondary_color: "Sekundärfarbe (Optional)",
    brand_kit_description: "Markenbeschreibung",
    brand_kit_description_placeholder: "Z.B., Spielerische Fitnessmarke für Frauen 25-35",
    brand_kit_tone: "Tonpräferenz",
    brand_kit_tone_modern: "Modern",
    brand_kit_tone_minimalist: "Minimalistisch",
    brand_kit_tone_playful: "Spielerisch",
    brand_kit_tone_elegant: "Elegant",
    brand_kit_tone_bold: "Mutig",
    brand_kit_generate: "Marken-Set erstellen",
    brand_kit_regenerate: "Neu generieren",
    brand_kit_generating: "Ihr Marken-Set wird erstellt...",
    brand_kit_color_palette: "Farbpalette",
    brand_kit_font_pairing: "Schriftpaarung",
    brand_kit_headline_font: "Überschrift",
    brand_kit_body_font: "Fließtext",
    brand_kit_mood: "Stimmung",
    brand_kit_keywords: "Schlüsselwörter",
    brand_kit_usage: "Verwendungstipps",
    brand_kit_ai_insight: "Warum das zu Ihrer Marke passt",
    brand_kit_copy_hex: "HEX kopieren",
    brand_kit_copied: "Kopiert!",
    brand_kit_my_kits: "Meine Marken-Sets",
    brand_kit_no_kits: "Noch keine Marken-Sets",
    brand_kit_create_first: "Erstellen Sie Ihr erstes Marken-Set",
    brand_kit_delete_confirm: "Möchten Sie dieses Marken-Set wirklich löschen?",
    
    // Carousel Generator
    carousel_title: "Karussell-Generator",
    carousel_subtitle: "Verwandle Text in ansprechende Präsentationen",
    carousel_input_label: "Dein Inhalt",
    carousel_input_placeholder: "Füge deinen Text oder Stichpunkte hier ein (2-2.500 Zeichen)...",
    carousel_slide_count: "Anzahl der Folien",
    carousel_platform: "Plattform",
    carousel_style: "Stil-Vorlage",
    carousel_brand_kit: "Marken-Set",
    carousel_brand_kit_default: "Standarddesign verwenden",
    carousel_cta_toggle: "CTA-Folie einschließen",
    carousel_generate: "Folien erstellen",
    carousel_improve: "Lesbarkeit verbessern",
    carousel_regenerate: "Gliederung neu erstellen",
    carousel_export_png: "PNG exportieren",
    carousel_export_pdf: "PDF exportieren",
    carousel_reorder: "Ziehen zum Neuordnen",
    carousel_add_slide: "Folie hinzufügen",
    carousel_remove_slide: "Folie entfernen",
    carousel_edit_slide: "Klicken zum Bearbeiten",
    carousel_slide_title: "Überschrift",
    carousel_slide_bullets: "Stichpunkte",
    carousel_no_projects: "Noch keine gespeicherten Karussell-Projekte",
    carousel_saved_projects: "Gespeicherte Projekte",
    carousel_load_project: "Laden",
    carousel_delete_project: "Löschen",
    carousel_save_project: "Projekt speichern",
    carousel_watermark_info: "Kostenloser Plan enthält Wasserzeichen",
    carousel_upgrade_for_more: "Upgrade auf Pro für 10 Folien, PDF-Export und kein Wasserzeichen",
    carousel_pdf_pro_only: "PDF-Export ist eine Pro-Funktion",
    
    // AI Content Coach
    coach_title: "KI-Content-Coach",
    coach_subtitle: "Erhalte personalisierte Strategieberatung von deinem KI-Mentor",
    coach_input_placeholder: "Frag mich alles zu deiner Content-Strategie...",
    coach_send: "Senden",
    coach_reset: "Unterhaltung zurücksetzen",
    coach_export: "Chat exportieren (PDF)",
    coach_typing: "Coach tippt...",
    coach_limit_reached: "Tageslimit erreicht (5 Nachrichten). Upgrade auf Pro für unbegrenztes Coaching.",
    coach_quick_prompts: "Schnellfragen",
    coach_prompt_1: "Wie kann ich meine LinkedIn-Reichweite verdoppeln?",
    coach_prompt_2: "Gib mir 3 Ideen für virale Reels diese Woche",
    coach_prompt_3: "Was ist der beste Posting-Plan für eine Tech-Marke?",
    coach_prompt_4: "Schreibe meine Caption für mehr Engagement um",
    coach_no_messages: "Starte ein Gespräch mit deinem KI-Content-Coach",
    coach_new_session: "Neue Unterhaltung",
    
    // AI Campaign Assistant
    campaign_title: "KI-Kampagnen-Assistent",
    campaign_subtitle: "Plane komplette Content-Kampagnen mit KI-generierten Strategien",
    campaign_goal_label: "Kampagnenziel",
    campaign_goal_placeholder: "Z.B., Promotion meines neuen eBooks über gesunde Ernährung",
    campaign_topic_label: "Thema",
    campaign_topic_placeholder: "Z.B., Fitness-Challenge, KI-Tools für kleine Unternehmen",
    campaign_duration_label: "Dauer (Wochen)",
    campaign_platform_label: "Plattform(en)",
    campaign_audience_label: "Zielgruppe (optional)",
    campaign_audience_placeholder: "Z.B., junge Berufstätige im Tech-Bereich",
    campaign_tone_label: "Tonalität",
    campaign_tone_friendly: "Freundlich",
    campaign_tone_bold: "Mutig",
    campaign_tone_educational: "Lehrreich",
    campaign_tone_emotional: "Emotional",
    campaign_tone_corporate: "Geschäftlich",
    campaign_frequency_label: "Beiträge pro Woche",
    campaign_generate: "Kampagnenplan erstellen",
    campaign_generating: "Kampagne wird erstellt...",
    campaign_summary: "Kampagnenübersicht",
    campaign_week: "Woche",
    campaign_theme: "Thema",
    campaign_day: "Tag",
    campaign_type: "Typ",
    campaign_title_col: "Titel",
    campaign_caption: "Caption-Konzept",
    campaign_hashtags: "Hashtags",
    campaign_cta: "CTA",
    campaign_best_time: "Beste Zeit",
    campaign_send_to_calendar: "In Kalender einfügen",
    campaign_open_generator: "Im Generator öffnen",
    campaign_hashtag_strategy: "Hashtag-Strategie",
    campaign_posting_tips: "Posting-Tipps",
    campaign_export_pdf: "PDF exportieren",
    campaign_delete: "Kampagne löschen",
    campaign_my_campaigns: "Meine Kampagnen",
    campaign_no_campaigns: "Noch keine Kampagnen. Erstelle deine erste Kampagne!",
    campaign_limit_reached: "Kostenloser Plan erlaubt 1 Kampagne (max 1 Woche). Upgrade auf Pro für unbegrenzte Kampagnen bis 8 Wochen.",
    campaign_created: "Kampagne erfolgreich erstellt!",
    campaign_deleted: "Kampagne gelöscht",
    campaign_added_to_calendar: "Beiträge zum Kalender hinzugefügt",
    
    // Content Audit
    audit_title: "Content-Audit-Tool",
    audit_subtitle: "Analysieren Sie Ihre Captions auf Engagement-Potenzial mit KI-gestützten Einblicken",
    audit_input_label: "Geben Sie Ihre Captions ein",
    audit_input_placeholder: "Caption hier einfügen...\n\nFür mehrere Captions, trennen Sie sie mit ---",
    audit_platform_label: "Plattform",
    audit_analyze_button: "Captions analysieren",
    audit_analyzing: "Analysiere Ihren Content...",
    audit_results_title: "Analyseergebnisse",
    audit_avg_score: "Durchschnittlicher Engagement-Score",
    audit_caption_preview: "Caption",
    audit_emotion: "Emotion",
    audit_cta_strength: "CTA-Stärke",
    audit_engagement_score: "Score",
    audit_suggestions: "Vorschläge",
    audit_overall_feedback: "Gesamtfeedback",
    audit_history_title: "Frühere Audits",
    audit_no_history: "Noch keine Audit-Historie",
    audit_delete: "Löschen",
    audit_limit_reached: "Tageslimit erreicht",
    audit_upgrade_message: "Kostenlose Nutzer können bis zu 3 Captions pro Tag analysieren. Upgraden Sie auf Pro für unbegrenzte Audits.",
    audit_strong: "Stark",
    audit_weak: "Schwach",
    audit_missing: "Fehlend",
    audit_word_count: "Wörter",
    audit_reading_level: "Lesestufe",
    
    // AI Post Generator
    aipost_title: "KI-Post-Generator",
    aipost_subtitle: "Verwandeln Sie Bilder mit KI-gesteuertem Design in vollständige Social Posts",
    aipost_upload_image: "Bild hochladen",
    aipost_description: "Kurzbeschreibung",
    aipost_description_placeholder: "Z.B. Promo für neuen Protein-Shake",
    aipost_platforms: "Plattformen",
    aipost_style: "Stil-Vorlage",
    aipost_tone: "Tonfall",
    aipost_brand_kit: "Brand Kit",
    aipost_cta: "Call-to-Action (Optional)",
    aipost_cta_placeholder: "Z.B. Jetzt kaufen, DM für mehr",
    aipost_generate_button: "Vollständigen Post generieren",
    aipost_generating: "Generiere deinen Post...",
    aipost_preview: "Vorschau",
    aipost_headline: "Überschrift",
    aipost_caption: "Caption",
    aipost_hashtags: "Hashtags",
    aipost_copy_caption: "Caption kopieren",
    aipost_download: "Herunterladen",
    aipost_send_to_calendar: "Zum Kalender senden",
    aipost_open_in_generator: "Im Generator öffnen",
    aipost_history: "Verlauf",
    aipost_no_history: "Noch keine generierten Posts",
    aipost_style_clean: "Clean",
    aipost_style_bold: "Bold",
    aipost_style_lifestyle: "Lifestyle",
    aipost_style_elegant: "Elegant",
    aipost_style_corporate: "Corporate",
    aipost_tone_friendly: "Freundlich",
    aipost_tone_informative: "Informativ",
    aipost_tone_persuasive: "Überzeugend",
    aipost_tone_playful: "Verspielt",
    aipost_tone_professional: "Professionell",
    
    // Background Replacer
    bg_title: "KI-Hintergrund-Ersteller",
    bg_subtitle: "Verwandeln Sie Produktfotos mit KI-generierten thematischen Hintergründen",
    bg_upload_product: "Produktbild hochladen",
    bg_choose_theme: "Thema wählen",
    bg_lighting: "Lichtpräferenz",
    bg_style_intensity: "Stil-Stärke",
    
    // Trend Radar
    trendRadar: {
      trend_title: "KI-Trendradar",
      fetch_button: "Neu laden",
      generate_post: "Inhalt generieren",
      bookmark: "Trend speichern",
      ideas: "Ideen für Inhalte",
      trending_now: "Was jetzt im Trend liegt",
      filter_platform: "Plattform",
      filter_language: "Sprache",
      filter_category: "Kategorie",
      popularity: "Beliebtheit",
      view_ideas: "Ideen ansehen",
      add_to_campaign: "Zu Kampagne hinzufügen",
      bookmarked: "Gespeichert",
      analyzing: "Trend wird analysiert...",
      no_trends: "Keine Trends gefunden",
      error_loading: "Fehler beim Laden der Trends",
    },
    bg_generate_scenes: "Szenen generieren",
    bg_generating: "Generiere 10 Varianten...",
    bg_preview: "Vorschau-Galerie",
    bg_download_selected: "Ausgewählte herunterladen",
    bg_download_all: "Alle herunterladen (ZIP)",
    bg_use_in_post: "Im Post-Generator verwenden",
    bg_schedule: "Post planen",
    bg_history: "Letzte Projekte",
    bg_no_history: "Noch keine Projekte",
    bg_removing_bg: "Hintergrund entfernen...",
    bg_theme_outdoor: "Outdoor / Natur",
    bg_theme_workspace: "Professioneller Arbeitsplatz",
    bg_theme_studio: "Minimales Studio",
    bg_theme_urban: "Urbaner Lebensstil",
    bg_theme_home: "Wohninterieur",
    bg_theme_retail: "Einzelhandel / Regal",
    bg_theme_kitchen: "Küche / Essenszubereitung",
    bg_theme_abstract: "Abstrakter Gradient",
    bg_lighting_natural: "Natürlich",
    bg_lighting_studio: "Weiches Studio",
    bg_lighting_dramatic: "Dramatisch",
    bg_lighting_neutral: "Neutral",
    bg_limit_reached: "Tageslimit erreicht. Upgraden Sie auf Pro für unbegrenzte Generierungen.",
    bg_pro_themes: "Pro-Themen: Alle 8 Themen verfügbar",
    
    // Reel Script Generator
    reelScript: {
      title: "KI-Reel-Skript-Generator",
      subtitle: "Erstelle komplette Video-Skripte für Reels, TikToks oder Shorts",
      input_section: "Skript-Details",
      input_description: "Geben Sie Ihre Video-Idee ein und wir erstellen ein vollständiges Skript",
      idea_label: "Idee oder Caption",
      idea_placeholder: "z.B., Ich möchte ein Reel über gesunde Smoothies machen",
      platform: "Plattform",
      duration: "Video-Dauer",
      tone: "Tonalität",
      brand_kit: "Brand Kit (optional)",
      language_label: "Sprache",
      generate_button: "Skript erstellen",
      generating: "Skript wird erstellt...",
      free_limit: "Free: 2 Skripte/Tag • Pro: Unbegrenzt",
      limit_reached: "Tageslimit erreicht",
      upgrade_message: "Upgrade auf Pro für unbegrenzte Skript-Generierung",
      no_script: "Ihr generiertes Skript erscheint hier",
      empty_state_hint: "Füllen Sie oben Ihre Idee aus und klicken Sie auf 'Skript erstellen', um ein professionelles Video-Skript mit exaktem Timing, Voice-over, On-Screen-Text und Shot-Vorschlägen zu erstellen.",
      caption: "Post-Caption",
      copy_caption: "Caption kopieren",
      next_steps: "Nächste Schritte",
      send_to_calendar: "Zum Kalender hinzufügen",
      send_to_post: "Visuellen Post erstellen",
      export_pdf: "Als PDF exportieren (Pro)",
      beats_timeline: "Beats-Zeitlinie",
      beats_description: "Folgen Sie dieser Beat-für-Beat-Übersicht, um Ihr Video zu erstellen",
      voiceover: "Voice-over",
      onscreen: "On-Screen",
      shot: "Shot",
      cta_broll: "Call-to-Action & B-Roll",
      call_to_action: "Call-to-Action",
      broll_suggestions: "B-Roll-Vorschläge",
      hashtags: "Hashtags",
      copy_sections: "Abschnitte kopieren",
      copy_vo: "Voice-over",
      copy_onscreen: "On-Screen-Text",
      copy_shots: "Shot-Liste",
      copy_hashtags: "Hashtags",
      download_txt: ".txt herunterladen",
      copied: "kopiert",
      downloaded: "Skript heruntergeladen",
      success: "Skript erstellt!",
      script_ready: "Ihr Skript ist einsatzbereit",
      fallback_used: "Fallback-Skript generiert",
      fallback_description: "Mit Fallback erstellt - sofort nutzbar oder neu versuchen",
      fallback_banner: "Dies ist eine Fallback-Version. Sie ist sofort nutzbar oder Sie können es erneut versuchen.",
      retrying: "Versuche erneut...",
      rate_limit_retry: "Rate-Limit erreicht, versuche in 1,5 Sekunden erneut",
      error_empty_idea: "Idee erforderlich",
      error_idea_too_short: "Bitte geben Sie mindestens 10 Zeichen für Ihre Video-Idee ein",
      error_idea_too_long: "Idee zu lang",
      error_max_1500: "Die Idee darf maximal 1500 Zeichen lang sein.",
      request_id: "Anfrage-ID",
      error_auth_required: "Authentifizierung erforderlich",
      error_please_login: "Bitte einloggen, um Skripte zu erstellen",
      error_validation: "Ungültige Eingabe",
      error_check_inputs: "Bitte überprüfen Sie Ihre Eingaben (Ideenlänge, Plattform, Dauer)",
      error_rate_limit: "Rate-Limit erreicht",
      error_wait_retry: "Zu viele Anfragen. Bitte warten Sie 30-60 Sekunden und versuchen Sie es erneut.",
      error_payment: "Credits erforderlich",
      error_add_credits: "KI-Service-Credits aufgebraucht. Bitte fügen Sie Credits hinzu, um fortzufahren.",
      error_failed: "Generierung fehlgeschlagen",
      error_unexpected: "Unerwarteter Fehler beim Generieren des Skripts. Unser Team wurde informiert.",
    },
    
    // Comment Manager
    commentManager: {
      title: "KI-Kommentar-Manager",
      subtitle: "Verwalten Sie Kommentare mit KI-gestützten Antwortvorschlägen",
      import_label: "Kommentare importieren",
      import_description: "Laden Sie Kommentare zur Analyse und Antwortvorschlägen hoch",
      platform: "Plattform",
      brand_tone: "Marken-Tonalität",
      manual_input: "Kommentare",
      input_placeholder: "Kommentare einfügen (einer pro Zeile):\nBenutzername | Kommentartext",
      input_format: "Format: Benutzername | Kommentartext (einer pro Zeile)",
      analyze_button: "Kommentare analysieren",
      analyzing: "Kommentare werden analysiert...",
      free_limit: "Free: 20 Kommentare/Tag • Pro: Unbegrenzt + Auto-Antwort",
      limit_reached: "Tageslimit erreicht",
      upgrade_message: "Upgrade auf Pro für unbegrenzte Kommentaranalyse",
      comments_list: "Kommentare & Antworten",
      total_comments: "Kommentare",
      no_comments: "Noch keine Kommentare. Importieren Sie Kommentare um zu beginnen.",
    },
    
    // Generator
    generator_title: "Textgenerator",
    generator_card_title: "Erstelle deine Caption",
    generator_card_description: "Fülle die Details aus, um die perfekte Social-Media-Caption zu erstellen.",
    usage_counter: "{used}/{total} Captions heute",
    input_topic: "Thema oder Idee",
    input_tone: "Tonalität",
    input_platform: "Plattform",
    btn_generate: "Jetzt erstellen",
    btn_copy: "Kopieren",
    btn_new: "Neue Idee",
    input_topic_placeholder: "Beispiel: Gesunder Smoothie für den Morgen",
    generator_error_empty_topic: "Bitte gib ein Thema oder eine Idee ein.",
    generator_error_auth_required: "Bitte melde dich an, um Captions zu erstellen.",
    generator_error_invalid_input: "Bitte überprüfe deine Eingaben.",
    generator_error_rate_limit: "Zu viele Anfragen. Bitte warte kurz und versuche es erneut.",
    generator_error_limit_reached: "Tageslimit erreicht. Upgraden Sie auf Pro für unbegrenzte Generierungen.",
    generator_error_payment_required: "AI-Credits aufgebraucht. Bitte füge Guthaben hinzu.",
    generator_error_service_unavailable: "Service vorübergehend nicht verfügbar. Bitte versuche es später erneut.",
    generator_error_unexpected: "Unerwarteter Fehler beim Erstellen der Caption. Bitte versuche es später erneut.",
    generator_error_retrying: "Wiederhole Anfrage...",
    
    // Tone options
    tone_friendly: "Freundlich",
    tone_professional: "Professionell",
    tone_funny: "Humorvoll",
    tone_emotional: "Emotional",
    tone_bold: "Mutig",
    tone_inspirational: "Inspirierend",
    tone_casual: "Locker",
    tone_formal: "Formell",
    tone_informative: "Informativ",
    tone_playful: "Verspielt",
    
    // Prompt Wizard
    wizard: {
      title: "Prompt-Assistent",
      subtitle: "Erstelle gezielte KI-Eingaben für bessere Ergebnisse.",
      infoTitle: "Optimierte Prompts für deine KI-Tools",
      infoDescription: "Erstelle maßgeschneiderte Prompts für bessere KI-Ergebnisse",
      platform: "Plattform",
      goal: "Ziel",
      businessType: "Unternehmen/Branche",
      tone: "Tonalität",
      keywords: "Schlüsselbegriffe",
      generate: "Prompt generieren",
      selectPlatform: "Plattform auswählen",
      selectGoal: "Ziel auswählen",
      selectTone: "Tonalität auswählen",
      businessPlaceholder: "z. B. Coaching, E-Commerce, Fitness",
      keywordsPlaceholder: "Schlüsselbegriffe eingeben (z. B. Marketing, Fitness, Motivation)",
      fillFields: "Bitte fülle alle erforderlichen Felder aus",
      generating: "Prompt wird generiert...",
      success: "Prompt erfolgreich generiert!",
      moreReach: "Mehr Reichweite",
      engagement: "Höheres Engagement",
      sales: "Verkäufe steigern",
      awareness: "Markenbekanntheit",
      growth: "Follower-Wachstum",
      results: "Generierter Prompt",
      optimizedPrompt: "Optimierter Prompt",
      whyItWorks: "Warum das funktioniert",
      example: "Beispiel-Caption",
      useInGenerator: "Im Generator verwenden",
      copyPrompt: "Prompt kopieren",
      newIdea: "Neue Idee",
      copied: "Prompt in Zwischenablage kopiert!"
    },
    
    // Hook Generator
    hooks: {
      title: "Hook-Generator",
      subtitle: "Finde aufmerksamkeitsstarke Einstiege für deine Posts",
      usageCounter: "Erstellte Hooks: {used}/{total} heute",
      inputTitle: "Thema oder Inhalt",
      inputDescription: "Gib dein Thema ein und wähle Plattform & Tonalität.",
      topic: "Thema",
      platform: "Plattform",
      tone: "Tonalität",
      audience: "Zielgruppe",
      styles: "Hook-Stile",
      generate: "Hooks erstellen",
      topicPlaceholder: "Beispiel: Motivation für Montagmorgen",
      audiencePlaceholder: "Zielgruppe eingeben",
      selectPlatform: "Plattform auswählen",
      selectTone: "Tonalität auswählen",
      styleCuriosity: "Neugier",
      styleProvocation: "Provokation",
      styleRelatable: "Nahbar",
      styleHumor: "Humor",
      styleAuthority: "Autorität",
      results: "Generierte Hooks",
      chars: "Zeichen",
      copy: "Kopieren",
      copyAll: "Alle kopieren",
      copiedAll: "Alle Hooks kopiert!",
      copied: "Hook kopiert!",
      useInGenerator: "Im Generator verwenden",
      generating: "Generiere...",
      success: "Hooks erfolgreich erstellt!",
      regenerated: "Hooks neu generiert!",
      fillFields: "Bitte fülle alle Felder aus",
      selectStyle: "Bitte wähle mindestens einen Stil aus",
      limitTitle: "Tageslimit erreicht",
      limitMessage: "Du hast dein kostenloses Tageslimit für Hooks erreicht. Upgrade auf Pro für unbegrenzten Zugriff.",
      helperText: "Tipp: Verwende diese Hooks als Eröffnungszeilen für deine Captions"
    },
    
    // Rewriter
    rewriter_title: "Caption-Umschreiber",
    rewriter_subtitle: "Verbessere oder verändere bestehende Beiträge mit KI",
    rewriter_original_caption: "Füge hier deine Caption ein",
    rewriter_placeholder: "Beispiel: Starte deinen Tag mit einem Lächeln und einer guten Tasse Kaffee.",
    rewriter_goal_label: "Ziel",
    rewriter_goal_viral: "Viral",
    rewriter_goal_emotional: "Emotional",
    rewriter_goal_professional: "Professionell",
    rewriter_goal_simplify: "Vereinfachen",
    rewriter_goal_tooltip: "Wähle das gewünschte Ziel für die Umformulierung",
    rewriter_button: "Neu formulieren",
    rewriter_empty_state: "Noch keine umgeschriebene Caption vorhanden",
    rewriter_result_title: "Umgeschriebene Caption",
    rewriter_why_works: "Warum das funktioniert",
    rewriter_suggestions: "Weitere Vorschläge",
    rewriter_success: "Caption erfolgreich umgeschrieben",
    rewriter_error_empty: "Bitte gib einen Text ein",
    rewriter_error_generic: "Beim Umschreiben ist ein Fehler aufgetreten",
    rewriter_limit_title: "Tageslimit erreicht",
    rewriter_limit_message: "Upgrade auf Pro für unbegrenzte Umschreibungen",
    rewriter_usage_counter: "{count}/{limit} Umschreibungen heute genutzt",
    rewriter_use_in_generator: "Im Generator verwenden",
    rewriter_pro_feature: "Pro-Funktion - Upgrade für Zugriff",
    
    // Posting Time Advisor
    advisor: {
      title: "Posting-Zeit-Berater",
      subtitle: "Analysiere deine beste Posting-Zeit für mehr Reichweite",
      platform: "Plattform",
      timezone: "Zeitzone",
      niche: "Themenbereich",
      goal: "Ziel",
      analyze: "Analyse starten",
      selectGoal: "Ziel auswählen (z. B. mehr Engagement)",
      selectPlatform: "Plattform auswählen",
      infoTitle: "Finde deine optimalen Posting-Zeiten",
      infoDescription: "Analysiere die besten Zeiten zum Posten für maximale Reichweite und Engagement",
      nichePlaceholder: "Themenbereich auswählen (z. B. Fitness, Mode, Marketing)",
      fillFields: "Bitte fülle alle erforderlichen Felder aus",
      success: "Analyse erfolgreich abgeschlossen!",
      copied: "Posting-Zeiten in Zwischenablage kopiert!",
      bestTimes: "Beste Posting-Zeiten",
      explanation: "Analyse-Erklärung",
      proTips: "Pro-Tipps"
    },
    
    // Authentication
    auth_login_title: 'Anmelden',
    auth_signup_title: 'Registrieren',
    auth_email: 'E-Mail',
    auth_password: 'Passwort',
    auth_password_confirm: 'Passwort bestätigen',
    auth_no_account: 'Noch kein Konto?',
    auth_have_account: 'Bereits ein Konto?',
    auth_welcome_back: 'Willkommen zurück!',
    auth_welcome_new: 'Willkommen bei CaptionGenie!',
    auth_show_password: 'Passwort anzeigen',
    auth_hide_password: 'Passwort verbergen',
    auth_remember_me: 'Angemeldet bleiben',
    auth_forgot_password: 'Passwort vergessen?',
    auth_login_description: 'Melde dich in deinem Konto an',
    auth_signup_description: 'Erstelle dein kostenloses Konto',
    
    // Global Buttons
    btn_analyze: "Analysieren",
    btn_save: "Speichern",
    btn_cancel: "Abbrechen",
    btn_download: "Herunterladen",
    btn_export: "Exportieren",
    btn_upload: "Hochladen",
    btn_login: "Anmelden",
    btn_signup: "Registrieren",
    btn_logout: "Abmelden",
    btn_try: "Jetzt testen",
    btn_start: "Jetzt starten",
    
    // Comments
    comments: {
      replySuggestions: "Antwortvorschläge",
      replySuggestionsGenerated: "Antwortvorschläge generiert",
      replySuggestionsDesc: "Wähle den passenden Stil",
      replySuggestionsFailed: "Fehler beim Generieren der Vorschläge",
      generateReplies: "KI-Antwortvorschläge",
      generateRepliesButton: "Antworten generieren",
      regenerateReplies: "Vorschläge neu generieren",
      copyReply: "Antwort kopieren",
      copiedToClipboard: "In Zwischenablage kopiert",
      replyTypeFriendly: "Freundlich",
      replyTypePromo: "Werblich",
      replyTypeCasual: "Locker"
    }
  },
  es: {
    header: {
      brand: "Inicio de AdTool AI",
      userMenu: "Menú de usuario",
      credits: "Créditos",
      account: "Cuenta",
      billing: "Facturación",
      support: "Soporte",
      logout: "Cerrar sesión",
    },
    commandBar: {
      placeholder: "Buscar o Cmd+K",
      searchPlaceholder: "Buscar funciones, páginas...",
      noResults: "No se encontraron resultados.",
      hint: "Presiona Cmd+K para abrir la búsqueda",
      other: "Otro",
    },
    // Feature Guides
    featureGuides: {
      common: {
        whatIsIt: "¿Qué es esto?",
        setupTitle: "Configuración en 5 pasos",
        proTip: "Consejo Pro",
        viewDocs: "Ver Documentación"
      },
      automation: {
        icon: "📅",
        title: "Automatización de Posts",
        description: "Planifica todo tu mes con anticipación – los posts se publican automáticamente en el mejor momento",
        whatIsIt: "¿Qué es Automatización de Posts?",
        whatDescription: "El Calendario Inteligente te permite programar todas tus publicaciones de redes sociales con semanas o meses de anticipación. Configúralo y olvídate – tu contenido se publica automáticamente mientras te enfocas en crear.",
        setupTitle: "Configuración en 5 pasos",
        step1: {
          title: "Abrir Calendario",
          description: "Navega al Calendario Inteligente desde la barra lateral",
          actionLabel: "Ir al Calendario",
          actionLink: "/calendar"
        },
        step2: {
          title: "Crear Primer Post",
          description: "Haz clic en '+ Agregar Post' o usa el formulario Quick-Add. Selecciona tu plataforma (Instagram, TikTok, LinkedIn, etc.)"
        },
        step3: {
          title: "Agregar Contenido",
          description: "Ingresa tu caption o genérala con IA. Sube medios (imagen/video)"
        },
        step4: {
          title: "Establecer Hora de Publicación",
          description: "Elige una fecha o usa 'Smart Scheduler' para horarios óptimos. Estado automáticamente establecido en 'Programado'"
        },
        step5: {
          title: "Publicación Automática",
          description: "Tu post se publicará automáticamente en el momento programado. Actualizaciones en tiempo real en el resumen de estado"
        },
        proTip: "Usa la función Auto-Schedule para que la IA encuentre los mejores momentos para máximo engagement basándose en el comportamiento de tu audiencia.",
        quickStartLabel: "Ir al Calendario",
        quickStartLink: "/calendar",
        docsLink: "/docs/calendar"
      },
      analytics: {
        icon: "📊",
        title: "Análisis de Rendimiento",
        description: "Comprende qué funciona con insights detallados – optimiza tu estrategia basándote en datos",
        whatIsIt: "¿Qué es Análisis de Rendimiento?",
        whatDescription: "Conecta tus cuentas de redes sociales y obtén insights profundos sobre qué contenido funciona mejor. Rastrea engagement, alcance y crecimiento en todas las plataformas en un solo dashboard.",
        setupTitle: "Configuración en 5 pasos",
        step1: {
          title: "Abrir Rastreador de Rendimiento",
          description: "Navega al Rastreador de Rendimiento en la barra lateral",
          actionLabel: "Ir a Rendimiento",
          actionLink: "/performance"
        },
        step2: {
          title: "Conectar Cuentas",
          description: "Ve a la pestaña 'Conexiones'. Haz clic en 'Conectar' para Instagram, TikTok, LinkedIn, X, etc. Autoriza la app (flujo OAuth)"
        },
        step3: {
          title: "Primera Sincronización",
          description: "Haz clic en 'Sincronizar Ahora' para importar tus posts. Puede tomar un minuto según la cantidad de posts"
        },
        step4: {
          title: "Ver Dashboard",
          description: "Cambia a la pestaña 'Resumen'. Ve tasa de engagement, alcance, posts top y tendencias de crecimiento"
        },
        step5: {
          title: "Generar Insights de IA",
          description: "Ve a la pestaña 'Insights de Captions'. Haz clic en 'Iniciar Análisis IA' para obtener sugerencias concretas de mejora"
        },
        proTip: "Sincroniza tus posts regularmente (semanalmente) para rastrear tendencias en el tiempo y detectar patrones en tu contenido más exitoso.",
        quickStartLabel: "Ir al Rastreador de Rendimiento",
        quickStartLink: "/performance",
        docsLink: "/docs/performance"
      },
      brandKit: {
        icon: "🎨",
        title: "Kit de Marca & Consistencia",
        description: "Mantén tu identidad de marca consistente en todas las plataformas y posts",
        whatIsIt: "¿Qué es Kit de Marca?",
        whatDescription: "Define tu voz de marca, valores e identidad visual una vez – luego cada post generado por IA se adapta automáticamente a tu estilo único. No más mensajes inconsistentes.",
        setupTitle: "Configuración en 5 pasos",
        step1: {
          title: "Crear Kit de Marca",
          description: "Navega a Kit de Marca en la barra lateral. Usa el asistente de onboarding para orientación",
          actionLabel: "Ir al Kit de Marca",
          actionLink: "/brand-kit"
        },
        step2: {
          title: "Ingresar Información Básica",
          description: "Define nombre de marca, audiencia objetivo y valores centrales"
        },
        step3: {
          title: "Analizar Voz de Marca",
          description: "Pega 3-5 captions de ejemplo que representen tu estilo. Haz clic en 'Analizar Voz' y la IA crea tu perfil de marca"
        },
        step4: {
          title: "Subir Logo (Opcional)",
          description: "Sube tu logo para extracción automática de paleta de colores y consistencia visual"
        },
        step5: {
          title: "Activar Kit de Marca",
          description: "Todos los posts generados ahora usan automáticamente tu voz de marca. Se rastrea el puntaje de consistencia"
        },
        proTip: "Actualiza tu Kit de Marca trimestralmente a medida que tu marca evoluciona. La IA aprende de tus posts más recientes para mantenerse actual.",
        quickStartLabel: "Crear Kit de Marca",
        quickStartLink: "/brand-kit"
      },
      coach: {
        icon: "🤖",
        title: "Coach de Contenido IA",
        description: "Obtén feedback en tiempo real sobre captions, hashtags y horarios de publicación – como un gerente personal de redes sociales",
        whatIsIt: "¿Qué es Coach de Contenido IA?",
        whatDescription: "Tu estratega de redes sociales 24/7. Haz preguntas, obtén revisiones de contenido, aprende mejores prácticas y recibe consejos personalizados basados en tus datos de rendimiento.",
        setupTitle: "Configuración en 5 pasos",
        step1: {
          title: "Abrir Coach",
          description: "Navega al Coach IA en la barra lateral",
          actionLabel: "Ir al Coach",
          actionLink: "/coach"
        },
        step2: {
          title: "Vincular Kit de Marca (Recomendado)",
          description: "Selecciona tu Kit de Marca activo para recomendaciones personalizadas alineadas con tu voz"
        },
        step3: {
          title: "Hacer Primera Pregunta",
          description: "Prueba: '¿Cómo puedo escribir mejores captions de Instagram?' El Coach analiza tus posts anteriores para contexto"
        },
        step4: {
          title: "Solicitar Revisión de Contenido",
          description: "Pega un caption para feedback en tiempo real sobre tono, hashtags, CTA y potencial de engagement"
        },
        step5: {
          title: "Activar Reportes Semanales (Opcional)",
          description: "Activa en Configuración → Notificaciones para recibir resúmenes semanales de rendimiento y consejos"
        },
        proTip: "¡Usa el Coach antes de publicar! Pega tu borrador de caption y pregunta '¿Funcionará bien esto?' para insights predictivos.",
        quickStartLabel: "Chatear con Coach",
        quickStartLink: "/coach"
      },
      publishing: {
        icon: "⚡",
        title: "Publicación Multi-Plataforma",
        description: "Publica simultáneamente en Instagram, TikTok, LinkedIn, X y YouTube – con un clic",
        whatIsIt: "¿Qué es Publicación Multi-Plataforma?",
        whatDescription: "Crea una vez, publica en todas partes. El Composer muestra vistas previas específicas de cada plataforma en tiempo real y adapta tu contenido (longitud de caption, hashtags, formato) para cada red.",
        setupTitle: "Configuración en 5 pasos",
        step1: {
          title: "Abrir Composer",
          description: "Navega al Composer en la barra lateral",
          actionLabel: "Ir al Composer",
          actionLink: "/composer"
        },
        step2: {
          title: "Seleccionar Plataformas",
          description: "Elige Instagram, TikTok, LinkedIn, X, YouTube Shorts. Ve vista previa específica de plataforma en tiempo real"
        },
        step3: {
          title: "Crear Contenido",
          description: "Escribe tu caption o génrala con IA. Sube medios (imagen/video)"
        },
        step4: {
          title: "Ajustes Específicos de Plataforma",
          description: "Adapta longitud de caption para X. Sugerencias de hashtags para Instagram. Verificación de formato de video para TikTok/Shorts"
        },
        step5: {
          title: "Publicar o Programar",
          description: "Haz clic en 'Publicar Ahora' para post instantáneo o 'Programar' para agregar al calendario"
        },
        proTip: "Usa la vista previa específica de plataforma para asegurar que tu video se vea perfecto en cada plataforma antes de publicar.",
        quickStartLabel: "Crear Nuevo Post",
        quickStartLink: "/composer"
      },
      goals: {
        icon: "📈",
        title: "Seguimiento de Objetivos & Logros",
        description: "Establece objetivos de contenido, rastrea progreso y alcanza hitos con logros motivadores",
        whatIsIt: "¿Qué es Seguimiento de Objetivos?",
        whatDescription: "Establece objetivos SMART (seguidores, posts por mes, tasa de engagement, ingresos) y rastrea el progreso automáticamente. Desbloquea logros y mantente motivado con gamificación.",
        setupTitle: "Configuración en 5 pasos",
        step1: {
          title: "Abrir Panel de Objetivos",
          description: "Navega al Panel de Objetivos en la barra lateral",
          actionLabel: "Ir a Objetivos",
          actionLink: "/goals-dashboard"
        },
        step2: {
          title: "Crear Primer Objetivo",
          description: "Haz clic en '+ Nuevo Objetivo'. Elige tipo de objetivo (ej. '10,000 seguidores para diciembre')"
        },
        step3: {
          title: "Definir Métricas",
          description: "Establece valor inicial, valor objetivo y fecha límite. Selecciona plataforma (Instagram, TikTok, etc.)"
        },
        step4: {
          title: "Rastrear Progreso",
          description: "El sistema rastrea automáticamente vía Rastreador de Rendimiento. Actualizaciones manuales posibles vía 'Actualizar Progreso'"
        },
        step5: {
          title: "Desbloquear Logros",
          description: "Alcanza hitos para ganar insignias. Comparte tus éxitos en redes sociales"
        },
        proTip: "Establece objetivos trimestrales realistas en lugar de anuales. Victorias más pequeñas te mantienen motivado y permiten ajustar la estrategia más rápido.",
        quickStartLabel: "Establecer Primer Objetivo",
        quickStartLink: "/goals-dashboard"
      }
    },
    
    // Goals Dashboard
    goals: {
      title: "Panel de Objetivos",
      subtitle: "Establece y sigue tus objetivos de redes sociales",
      activeGoals: "Objetivos Activos",
      completed: "Objetivos Completados",
      avgProgress: "Progreso Promedio",
      addGoal: "Agregar Nuevo Objetivo",
      createNewGoal: "Crear Nuevo Objetivo",
      createGoal: "Crear Objetivo",
      active: "Activos",
      completedTab: "Completados",
      noActiveGoals: "Aún no hay objetivos activos. ¡Comienza creando tu primer objetivo!",
      noCompletedGoals: "Aún no hay objetivos completados. ¡Sigue trabajando hacia tus metas!",
      motivationBanner: "¡Sigue adelante – pequeños pasos conducen a grandes éxitos!",
      platform: "Plataforma",
      goalType: "Tipo de Objetivo",
      targetValue: "Valor Objetivo",
      updateValue: "Actualizar valor",
      endDate: "Fecha de Fin",
      optional: "opcional",
      deadline: "Fecha límite",
      success: "Éxito",
      error: "Error",
      goalCreated: "Objetivo creado exitosamente",
      goalDeleted: "Objetivo eliminado exitosamente",
      goalCompleted: "🎉 ¡Objetivo Completado!",
      congratulations: "¡Excelente trabajo! ¡Has alcanzado tu meta!",
      loadError: "Error al cargar objetivos",
      createError: "Error al crear objetivo",
      deleteError: "Error al eliminar objetivo",
      fillAllFields: "Por favor completa todos los campos requeridos",
      limitReached: "Límite de Objetivos Alcanzado",
      upgradeForMore: "Actualiza a Pro para objetivos ilimitados",
      aiInsight: "Insight de IA",
      saving: "Guardando...",
      save: "Guardar",
      types: {
        followers: "Seguidores",
        postsPerMonth: "Posts por Mes",
        engagementRate: "Tasa de Engagement",
        contentCreated: "Contenido Creado",
        revenue: "Ingresos"
      },
      filters: {
        timeframe: "Período",
        platform: "Plataforma",
        all: "Todas las Plataformas",
        "7days": "7 Días",
        "30days": "30 Días",
        "90days": "90 Días"
      },
      kpi: {
        totalViews: "Vistas Totales",
        totalLikes: "Likes Totales",
        totalComments: "Comentarios Totales",
        avgEngagement: "Engagement Prom."
      },
      metrics: {
        title: "Rendimiento del Contenido",
        addMetrics: "Agregar Métricas",
        content: "Contenido",
        views: "Vistas",
        likes: "Likes",
        comments: "Comentarios",
        shares: "Compartidos",
        engagementRate: "Tasa de Engagement",
        caption: "Caption",
        captionPlaceholder: "Título del post o descripción...",
        captionRequired: "Se requiere caption",
        postedAt: "Fecha de Publicación",
        saved: "Métricas guardadas exitosamente",
        saveError: "Error al guardar métricas",
        noData: "Aún no hay datos. ¡Agrega las métricas de tu primer post!"
      },
      charts: {
        engagementTrend: "Tendencia de Engagement",
        platformComparison: "Comparación de Plataformas",
        engagementRate: "Tasa de Engagement",
        posts: "Posts",
        avgEngagement: "Engagement Prom. (%)"
      },
      trends: {
        title: "Tendencias de Rendimiento",
        engagement: "Cambio de Engagement",
        bestTimes: "Mejores Horarios de Publicación"
      },
      recommendations: {
        title: "Recomendaciones de IA",
        noData: "Aún no hay suficientes datos para recomendaciones",
        addMoreData: "Agrega más posts para obtener insights personalizados"
      },
      quickWins: {
        title: "Victorias Rápidas"
      },
      achievements: {
        title: "Logros",
        consistencyStreak: "Racha de Consistencia",
        monthlyPosts: "Posts Mensuales",
        engagementHero: "Héroe del Engagement",
        goalCompleter: "Completador de Objetivos",
        days: "días",
        posts: "posts",
        completed: "completados",
        unlocked: "Desbloqueado ✓",
        locked: "Bloqueado",
        earned: "Obtenido",
        motivationText: "¡Sigue creando y alcanzando tus objetivos para desbloquear más logros!"
      }
    },
    
    // Onboarding
    onboarding: {
      welcome: {
        title: "¡Bienvenido a CaptionGenie!",
        description: "Tu panel muestra todas las actividades e insights de un vistazo"
      },
      features: {
        title: "Explora las Funciones",
        description: "Navega por nuestras herramientas de IA organizadas por categoría"
      },
      generator: {
        title: "Crea tu Primera Caption",
        description: "Comienza con nuestro Generador de Captions IA – tu herramienta más usada"
      },
      performance: {
        title: "Sigue tu Éxito",
        description: "Monitorea el rendimiento de tus posts y obtén insights de IA"
      },
      back: "Atrás",
      next: "Siguiente",
      finish: "Comenzar",
      modal: {
        title: "¡Bienvenido a CaptionGenie!",
        subtitle: "Tu Plataforma de Gestión de Redes Sociales con IA",
        feature1: {
          title: "Creación de Contenido IA",
          description: "Genera captions, hooks y guiones al instante"
        },
        feature2: {
          title: "Análisis de Rendimiento",
          description: "Rastrea y optimiza tu éxito en redes sociales"
        },
        feature3: {
          title: "Programación Inteligente",
          description: "Planifica y organiza tu calendario de contenido"
        },
        feature4: {
          title: "Consistencia de Marca",
          description: "Mantén tu voz única en todas las plataformas"
        },
        skip: "Saltar Tour",
        startTour: "Hacer un Tour Rápido"
      }
    },
    
    // Command Palette
    commandPalette: {
      placeholder: "Buscar funciones...",
      noResults: "No se encontraron resultados"
    },
    
    // Calendar (Enterprise)
    calendar: {
      // Scope Switcher
      workspace: "Espacio de trabajo",
      client: "Cliente",
      brand: "Marca",
      selectWorkspace: "Seleccionar espacio",
      selectClient: "Seleccionar cliente",
      selectBrand: "Seleccionar marca",
      allClients: "Todos los clientes",
      allBrands: "Todas las marcas",
      
      // Views
      views: {
        month: "Mes",
        week: "Semana",
        list: "Lista",
        kanban: "Kanban",
        timeline: "Línea de tiempo"
      },
      
      // Status
      status: {
        briefing: "Briefing",
        in_progress: "En progreso",
        review: "Revisión",
        pending_approval: "Pendiente de aprobación",
        approved: "Aprobado",
        scheduled: "Programado",
        published: "Publicado",
        cancelled: "Cancelado"
      },
      
      // Actions
      actions: {
        createEvent: "Crear publicación",
        addNote: "Añadir nota",
        autoSchedule: "Auto-programar",
        manageIntegrations: "Gestionar Integraciones",
        sendForApproval: "Enviar para aprobar",
        duplicate: "Duplicar",
        exportPDF: "Exportar PDF",
        exportCSV: "Exportar CSV",
        exportICS: "Exportar ICS",
        filter: "Filtrar",
        share: "Compartir",
        settings: "Configuración",
        bulkEdit: "Edición masiva",
        bulkDelete: "Eliminar todo",
        bulkMove: "Mover",
        bulkChangeStatus: "Cambiar estado",
        clearSelection: "Limpiar selección"
      },
      
      // Integrations
      integrations: {
        title: "Integraciones de Calendario",
        googleCalendar: "Google Calendar",
        slack: "Notificaciones Slack",
        discord: "Notificaciones Discord",
        notifications: "Notificaciones"
      },
      
      // Event Card / Drawer
      event: {
        title: "Título",
        channels: "Canales",
        status: "Estado",
        publishTime: "Hora de publicación",
        timezone: "Zona horaria",
        owner: "Responsable",
        assignees: "Asignado a",
        campaign: "Campaña",
        tags: "Etiquetas",
        brief: "Briefing",
        assets: "Recursos",
        hashtags: "Hashtags",
        versions: "Versiones",
        comments: "Comentarios",
        tasks: "Tareas",
        approval: "Aprobación",
        created: "Creado",
        updated: "Actualizado",
        publishedAt: "Publicado el",
        noTitle: "Sin título"
      },
      
      // Capacity Planning
      capacity: {
        available: "Disponible",
        planned: "Planificado",
        overbooked: "Sobrecargado",
        hours: "horas",
        warning: "Advertencia de capacidad",
        teamUtilization: "Utilización del equipo",
        weeklyCapacity: "Capacidad semanal"
      },
      
      // Filters
      filters: {
        all: "Todos",
        channel: "Canal",
        status: "Estado",
        campaign: "Campaña",
        owner: "Responsable",
        dateRange: "Rango de fechas",
        clearAll: "Limpiar todo"
      },
      
      // Messages & Toasts
      messages: {
        eventCreated: "Evento creado exitosamente",
        eventUpdated: "Evento actualizado",
        eventDeleted: "Evento eliminado",
        eventMoved: "Evento movido",
        approvalSent: "Enviado para aprobación",
        approvalApproved: "Aprobado exitosamente",
        approvalRejected: "Cambios solicitados",
        capacityExceeded: "Capacidad del equipo excedida",
        blackoutDate: "Esta fecha está bloqueada",
        copySuccess: "Enlace copiado",
        exportSuccess: "Exportación exitosa",
        loadFailed: "Error al cargar eventos",
        moveFailed: "Error al mover",
        statusFailed: "Error al actualizar estado",
        statusUpdated: "Estado actualizado",
        noEventsToExport: "No hay eventos para exportar",
        pdfPrintDialog: "Abriendo diálogo de impresión para PDF...",
        saving: "Guardando...",
        createEventComingSoon: "Crear evento próximamente",
        addNoteComingSoon: "Añadir nota próximamente",
        filterComingSoon: "Filtros próximamente",
        shareComingSoon: "Compartir próximamente",
        workspaceCreated: "Espacio creado exitosamente",
        defaultWorkspace: "Mi Espacio"
      },
      
      // Export options
      export: {
        csv: "Exportar CSV",
        pdf: "Exportar PDF",
        ics: "Exportar calendario ICS",
        metrics: "CSV de métricas"
      },
      
      // Empty States
      empty: {
        noEvents: "No hay eventos",
        noEventsDesc: "Crea tu primer evento",
        noWorkspace: "No hay espacio seleccionado",
        noWorkspaceDesc: "Por favor selecciona un espacio",
        noResults: "No se encontraron resultados",
        noResultsDesc: "Intenta ajustar los filtros",
        workspaceRequired: "Espacio requerido",
        workspaceRequiredDesc: "El Calendario de Contenido organiza tus publicaciones en espacios. Crea un espacio para comenzar.",
        createWorkspace: "Crear espacio",
        workspaceInfo: "Los espacios permiten la colaboración en equipo y organizan tu planificación de contenido"
      },
      
      // Tasks
      tasks: {
        title: "Tareas",
        createTask: "Crear tarea",
        taskTitle: "Título de tarea",
        description: "Descripción",
        priorityLabel: "Prioridad",
        dueDate: "Fecha límite",
        assignTo: "Asignar a",
        status: {
          todo: "Por hacer",
          in_progress: "En progreso",
          done: "Completado",
          cancelled: "Cancelado"
        },
        priority: {
          low: "Baja",
          medium: "Media",
          high: "Alta"
        }
      },
      
      // Approval / Review
      approval: {
        title: "Aprobación",
        sendForReview: "Enviar para revisión",
        reviewLink: "Enlace de revisión",
        createReviewLink: "Crear enlace de revisión",
        copyLink: "Copiar enlace",
        approverEmail: "Email del aprobador",
        message: "Mensaje",
        approve: "Aprobar",
        requestChanges: "Solicitar cambios",
        comment: "Comentario",
        reviewExpires: "El enlace expira",
        pending: "Pendiente",
        approved: "Aprobado",
        changesRequested: "Cambios solicitados"
      },
      
      // Campaigns
      campaigns: {
        title: "Campañas",
        createCampaign: "Crear campaña",
        selectTemplate: "Seleccionar plantilla",
        generateFromTemplate: "Generar desde plantilla",
        noCampaign: "Sin campaña"
      },
      
      // Create Event Dialog
      create: {
        title: "Crear Evento",
        stepBasics: "Básico",
        stepPlanning: "Planificación",
        stepContent: "Contenido",
        stepTeam: "Equipo",
        eventTitle: "Título",
        eventBrief: "Briefing",
        selectClient: "Seleccionar Cliente",
        selectBrand: "Seleccionar Marca",
        selectCampaign: "Seleccionar Campaña",
        selectStatus: "Seleccionar Estado",
        selectChannels: "Seleccionar Canales",
        startDateTime: "Hora de inicio",
        endDateTime: "Hora de fin (opcional)",
        timezone: "Zona horaria",
        caption: "Caption",
        hashtags: "Hashtags",
        tags: "Etiquetas",
        selectOwner: "Responsable",
        selectAssignees: "Asignados",
        estimatedMinutes: "Minutos estimados",
        back: "Atrás",
        next: "Siguiente",
        saveAsDraft: "Guardar como borrador",
        createEvent: "Crear Evento",
        titleRequired: "El título es obligatorio",
        channelRequired: "Selecciona al menos 1 canal",
        eventCreated: "Evento creado",
        eventCreationFailed: "Error al crear evento"
      },
      
      // Timeline View
      timeline: {
        campaigns: "Campañas",
        noCampaign: "Sin campaña",
        noPosts: "No hay publicaciones este mes"
      },
      
      // Modal: Add Post
      addPost: {
        title: "Añadir publicación",
        editPost: "Editar publicación",
        platform: "Plataforma",
        caption: "Leyenda",
        captionPlaceholder: "Escribe tu leyenda aquí...",
        status: "Estado",
        scheduleDate: "Fecha programada",
        time: "Hora",
        pickDate: "Elegir fecha",
        tags: "Etiquetas (Opcional)",
        tagsPlaceholder: "#marketing, #socialmedia",
        suggestedTime: "Mejor hora sugerida para",
        delete: "Eliminar",
        cancel: "Cancelar",
        save: "Guardar",
        saving: "Guardando...",
        captionRequired: "La leyenda es obligatoria",
        captionTooLong: "La leyenda excede el límite de {limit} caracteres para {platform}",
        postCreated: "Publicación creada",
        postUpdated: "Publicación actualizada",
        postDeleted: "Publicación eliminada",
        saveFailed: "Error al guardar",
        deleteFailed: "Error al eliminar",
        draft: "Borrador",
        scheduled: "Programado",
        posted: "Publicado"
      },
      
      // Modal: Add Note
      addNote: {
        title: "Añadir nota",
        date: "Fecha",
        noDateSelected: "No hay fecha seleccionada",
        noteText: "Nota",
        notePlaceholder: "ej., Grabar video para post del lunes",
        cancel: "Cancelar",
        save: "Guardar",
        saving: "Guardando...",
        noteRequired: "El texto de la nota es obligatorio",
        dateRequired: "Por favor selecciona una fecha",
        noteCreated: "Nota creada",
        saveFailed: "Error al guardar"
      },
      
      // Event Drawer
      drawer: {
        eventDetails: "Detalles del evento",
        details: "Detalles",
        tasks: "Tareas",
        comments: "Comentarios",
        approval: "Aprobación",
        briefPlaceholder: "Brief del contenido, objetivos, audiencia...",
        captionPlaceholder: "Leyenda del post...",
        scheduledTime: "Hora programada",
        notScheduled: "No programado",
        duplicate: "Duplicar",
        requestApproval: "Solicitar aprobación",
        delete: "Eliminar",
        updateFailed: "Error al actualizar",
        eventUpdated: "Evento actualizado",
        duplicateFailed: "Error al duplicar",
        eventDuplicated: "Evento duplicado",
        deleteFailed: "Error al eliminar",
        eventDeleted: "Evento eliminado",
        loadFailed: "Error al cargar",
        approvalDesc: "Envía este evento para aprobación creando un enlace de revisión.",
        createApprovalRequest: "Crear solicitud de aprobación"
      },
      
      // Auto-Schedule
      autoSchedule: {
        title: "Auto-programación",
        description: "La IA sugiere horarios óptimos",
        analyze: "Analizar",
        suggestions: "Sugerencias",
        applyAll: "Aplicar todo",
        bestTime: "Mejor hora",
        reason: "Razón",
        score: "Puntuación"
      },
      
      // Holiday Suggestions
      holidays: {
        title: "Sugerencias de Festivos",
        subtitle: "Ideas de contenido con IA para próximos festivos",
        selectMonth: "Seleccionar mes",
        selectRegion: "Región",
        generate: "Generar ideas",
        generating: "Analizando festivos...",
        createEvent: "Crear evento",
        noHolidays: "No se encontraron festivos para este período",
        success: "Sugerencias de festivos cargadas",
        error: "Error al cargar festivos",
        contentIdeas: "Ideas de Contenido",
        regions: {
          de: "Alemania",
          en: "Reino Unido",
          es: "España"
        }
      },
      
      // Blackout Dates
      blackout: {
        title: "Fechas bloqueadas",
        addDate: "Añadir fecha",
        date: "Fecha",
        reason: "Razón",
        note: "Nota",
        allDay: "Todo el día"
      },
      
      // Comments
      comments: {
        title: "Comentarios",
        addComment: "Añadir comentario",
        reply: "Responder",
        mentionUser: "Mencionar usuario (@)",
        noComments: "Sin comentarios aún"
      },
      
      // Toolbar
      toolbar: {
        today: "Hoy",
        previousMonth: "Mes anterior",
        nextMonth: "Próximo mes",
        previousWeek: "Semana anterior",
        nextWeek: "Próxima semana"
      },
      
      // Mobile
      mobile: {
        viewSelector: "Vista",
        moreActions: "Más acciones",
        events: "Eventos"
      },
      
      // API Messages
      api: {
        errors: {
          UNAUTHORIZED: "No autorizado",
          MISSING_REQUIRED_FIELDS: "Faltan campos obligatorios",
          TEMPLATE_NOT_FOUND: "Plantilla no encontrada",
          NO_DRAFTS_AVAILABLE: "No hay borradores disponibles",
          NO_POSTS_IN_RANGE: "No hay publicaciones en el rango",
          POST_NOT_FOUND: "Publicación no encontrada",
          SCHEDULE_CONFLICT: "Conflicto de horario",
          CAPACITY_EXCEEDED: "Capacidad excedida",
          GENERATION_FAILED: "Generación fallida",
          EXPORT_FAILED: "Exportación fallida",
          INTERNAL_ERROR: "Error interno"
        },
        success: {
          POSTS_SCHEDULED: "{count} publicaciones programadas",
          SCHEDULE_APPLIED: "Horario aplicado",
          CAMPAIGN_CREATED: "Campaña creada con {count} eventos",
          EVENT_RESCHEDULED: "Evento reprogramado",
          EXPORT_READY: "Exportación lista"
        },
        timeQuality: {
          BEST_TIME: "Mejor momento",
          GOOD_TIME: "Buen momento",
          PRIME_TIME: "Momento óptimo de engagement",
          AVOIDING_CONFLICT: "Conflicto evitado",
          BLACKOUT_AVOIDED: "Blackout evitado"
        }
      }
    },
    
    // Analytics
    analytics: {
      unified: {
        title: "Panel de Analytics",
        subtitle: "Insights completos de todas las plataformas",
        tabs: {
          overview: "Resumen",
          performance: "Rendimiento",
          topContent: "Mejor Contenido",
          hashtags: "Hashtags",
          campaigns: "Campañas",
          reports: "Informes"
        }
      },
      totalContent: "Contenido Total Creado",
      totalContentDesc: "Posts y hooks generados",
      thisWeek: "Esta Semana",
      vsLastWeek: "vs semana pasada",
      goalsAchieved: "Objetivos Alcanzados",
      goalsAchievedDesc: "Hitos completados",
      streak: "Racha Activa",
      days: "días",
      streakDesc: "¡Sigue así!",
      performanceInsight: "Insight de Rendimiento",
      engagementRateMessage: "Tus posts promedian {rate}% de engagement en {platform}. ¡Excelente trabajo!",
      title: "Análisis Avanzado",
      subtitle: "Información detallada sobre tu rendimiento de contenido",
      hashtags: "Análisis de Hashtags",
      bestContent: "Mejor Contenido",
      roi: "ROI de Campaña",
      reports: "Informes",
      scheduled: "Programado",
      hashtagPerformance: "Rendimiento de Hashtags",
      hashtagDescription: "Rastrea qué hashtags generan más interacción",
      analyzeNow: "Analizar Ahora",
      posts: "publicaciones",
      reach: "alcance",
      engagement: "interacción",
      topPerformingContent: "Contenido de Mejor Rendimiento",
      bestContentDescription: "Tus publicaciones más exitosas basadas en interacción",
      identifyBest: "Identificar Mejores",
      score: "puntuación",
      campaignROI: "Seguimiento de ROI de Campaña",
      roiDescription: "Monitorea el retorno de inversión de tus campañas",
      noCampaigns: "Aún no se rastrean campañas",
      ongoing: "En curso",
      hashtagAnalysisComplete: "Análisis de Hashtags Completo",
      hashtagsAnalyzed: "hashtags analizados",
      analysisComplete: "Análisis Completo",
      postsAnalyzed: "publicaciones analizadas",
      reportBuilder: "Constructor de Informes",
      builderDescription: "Crea informes de análisis personalizados",
      createTemplate: "Crear Plantilla",
      newTemplate: "Nueva Plantilla de Informe",
      templateDescription: "Configura tu plantilla de informe personalizada",
      templateName: "Nombre de Plantilla",
      templateNamePlaceholder: "ej., Informe de Rendimiento Mensual",
      description: "Descripción",
      descriptionPlaceholder: "Describe qué incluye este informe",
      dateRange: "Rango de Fechas",
      last7Days: "Últimos 7 Días",
      last30Days: "Últimos 30 Días",
      last90Days: "Últimos 90 Días",
      platforms: "Plataformas",
      sections: "Secciones",
      metrics: "Métricas",
      includeLogo: "Incluir Logo",
      templateCreated: "Plantilla creada",
      templateCreatedDescription: "Tu plantilla de informe está lista para usar",
      generatingReport: "Generando informe",
      pleaseWait: "Por favor espera...",
      reportGenerated: "Informe generado",
      reportReady: "Tu informe está listo para descargar",
      generatePDF: "Generar PDF",
      generateCSV: "Exportar CSV",
      scheduledReports: "Informes Programados",
      scheduledDescription: "Automatiza la entrega de informes por correo",
      scheduleNew: "Programar Nuevo",
      newSchedule: "Nueva Programación de Informe",
      scheduleFormDescription: "Configura la entrega automática de informes",
      scheduleName: "Nombre de Programación",
      scheduleNamePlaceholder: "ej., Informe Semanal del Equipo",
      template: "Plantilla",
      selectTemplate: "Selecciona una plantilla",
      frequency: "Frecuencia",
      daily: "Diaria",
      weekly: "Semanal",
      monthly: "Mensual",
      recipients: "Destinatarios",
      recipientsHelp: "Separa múltiples correos con comas",
      firstSendDate: "Fecha de Primer Envío",
      schedule: "Programar",
      scheduleCreated: "Programación creada",
      scheduleCreatedDescription: "Los informes se enviarán automáticamente",
      scheduleUpdated: "Programación actualizada",
      statusUpdated: "Estado actualizado con éxito",
      scheduleDeleted: "Programación eliminada",
      scheduleDeletedDescription: "Informes automáticos cancelados",
      nextSend: "Próximo envío",
      lastSent: "Último envío",
      active: "Activo",
      paused: "Pausado"
    },
    
    scheduler: {
      title: "Programador Inteligente",
      subtitle: "Automatiza publicaciones recurrentes y programación por lotes",
      createRecurring: "Crear Publicación Recurrente",
      newRecurringPost: "Nueva Publicación Recurrente",
      formDescription: "Configura una publicación que se publicará automáticamente según un horario",
      titlePlaceholder: "ej., Motivación de Lunes",
      caption: "Descripción",
      captionPlaceholder: "Escribe la descripción de tu publicación...",
      platform: "Plataforma",
      frequency: "Frecuencia",
      daily: "Diaria",
      weekly: "Semanal",
      biweekly: "Cada 2 Semanas",
      monthly: "Mensual",
      firstPostTime: "Hora de Primera Publicación",
      create: "Crear Publicación Recurrente",
      active: "Activo",
      paused: "Pausado",
      lastPosted: "Última publicación",
      postCreated: "Publicación Recurrente Creada",
      postCreatedDescription: "Tu publicación se publicará automáticamente",
      updated: "Actualizado",
      statusUpdated: "Estado de publicación actualizado",
      deleted: "Eliminado",
      postDeleted: "Publicación recurrente eliminada",
      recurringPosts: "Publicaciones Recurrentes",
      postQueue: "Cola de Publicaciones",
      queueDescription: "Gestiona tus publicaciones programadas",
      noQueuedPosts: "No hay publicaciones en cola",
      queueItemDeleted: "Elemento de cola eliminado",
      queueItemDeletedDescription: "La publicación fue removida de la cola",
      retry: "Reintentar",
      retryScheduled: "Reintento programado",
      retryScheduledDescription: "La publicación fallida se reintentará",
      status: {
        pending: "Pendiente",
        completed: "Completado",
        failed: "Fallido"
      }
    },
    
    // Top level
    home: "Inicio",
    "pricing.title": "Precios Simples y Transparentes",
    "pricing.subtitle": "Elige el plan que se adapte a tu flujo de trabajo. Comienza gratis, actualiza en cualquier momento.",
    "pricing.free": "Gratis",
    "pricing.freePrice": "€0",
    "pricing.freeDesc": "Perfecto para probar CaptionGenie",
    "pricing.freeFeature1": "20 captions de IA por mes",
    "pricing.freeFeature2": "Plantillas básicas",
    "pricing.freeFeature3": "Soporte comunitario",
    "pricing.tryFree": "Comenzar gratis",
    "pricing.proMonthly": "Basic",
    "pricing.proYearly": "Pro",
    "pricing.month": "mes",
    "pricing.year": "mes",
    "pricing.cancelAnytime": "Más Popular",
    "pricing.saveFortyTwo": "Para Usuarios Avanzados",
    "pricing.proFeature1": "200 captions de IA por mes",
    "pricing.proFeature2": "Todas las plantillas premium",
    "pricing.proFeature3": "Generador de hashtags",
    "pricing.proFeature4": "Gestionar hasta 2 marcas",
    "pricing.proFeature5": "Soporte prioritario por correo electrónico",
    "pricing.startNow": "Actualizar a Basic",
    "pricing.benefit1": "Cancelar en cualquier momento",
    "pricing.benefit2": "Seguro vía Stripe",
    "pricing.benefit3": "Listo en 60 segundos",
    
    pricingDetails: {
      header: {
        badge: "Precios Simples y Transparentes",
        title: "Crece con CaptionGenie",
        subtitle: "Elige el plan que se adapte a tu flujo de trabajo. Comienza gratis, actualiza en cualquier momento.",
      },
      period: "mes",
      popularBadge: "POPULAR",
      loading: "Cargando...",
      plans: {
        free: {
          title: "Gratis",
          subtitle: "Empezar",
          description: "Perfecto para probar CaptionGenie",
          buttonText: "Comenzar gratis",
          features: [
            "20 captions de IA por mes",
            "Plantillas básicas",
            "Soporte comunitario",
            "Sugerencias de hashtags",
            "Gestión de marcas",
            "Análisis",
            "Marca de agua en exportaciones",
          ],
        },
        basic: {
          title: "Basic",
          subtitle: "Más Popular",
          description: "Mejor para creadores de contenido y pequeñas empresas",
          buttonText: "Actualizar a Basic",
          features: [
            "200 captions de IA por mes",
            "Todas las plantillas premium",
            "Generador de hashtags",
            "Gestionar hasta 2 marcas",
            "Eliminar marca de agua",
            "Soporte prioritario por correo electrónico",
            "Panel de análisis",
            "Colaboración en equipo",
          ],
        },
        pro: {
          title: "Pro",
          subtitle: "Para Usuarios Avanzados",
          description: "Perfecto para agencias y equipos",
          buttonText: "Hacerse Pro",
          features: [
            "Captions de IA ilimitados",
            "Marcas ilimitadas",
            "Modelos de IA avanzados",
            "Herramientas de colaboración en equipo",
            "Panel de análisis",
            "Exportaciones de marca blanca",
            "Soporte prioritario e incorporación",
            "Integraciones personalizadas",
          ],
        },
      },
      custom: {
        title: "¿Necesitas un plan personalizado?",
        description: "Ofrecemos soluciones a medida para empresas y equipos grandes.",
        contact: "Contáctanos en bestofproducts4u@gmail.com",
      },
      errors: {
        checkoutFailed: "No se pudo iniciar el pago",
      },
    },
    
    pricing: {
      promo: {
        placeholder: "Ingresar código promocional",
        apply: "Aplicar",
        invalid: "Código promocional inválido",
        error: "Error al validar el código",
        applied: "Código aplicado",
        for3months: "por 3 meses",
        hint: "Con Código de Creator: −30% por 3 meses • Creator recibe 20% de comisión"
      },
      intro: {
        basic: "Mes de Intro: Solo €4.99 en lugar de €14.99",
        enterprise: "Mes de Intro: Solo €9.99 en lugar de €69.99",
        monthly: "Cancelar en cualquier momento"
      },
      features: {
        quickPostLocked: "Publicación Rápida en Calendario (Función Pro)",
        quickPostDesc: "Programa publicaciones con un clic—actualiza a Pro o Enterprise para desbloquear esta función.",
        autoScheduleLocked: "Auto-Programación IA (Función Pro)",
        autoScheduleDesc: "Deja que la IA encuentre automáticamente los mejores momentos para publicar—disponible en planes Pro y Enterprise."
      },
      upgrade: {
        toPro: "Actualizar a Pro",
        toEnterprise: "Actualizar a Enterprise"
      }
    },
    
    faq: {
      title: "Preguntas frecuentes",
      questions: {
        q1: {
          question: "¿Qué es CaptionGenie?",
          answer: "CaptionGenie es una herramienta impulsada por IA que te ayuda a crear pies de foto atractivos y optimizados para tus publicaciones en redes sociales. Ahorra tiempo mientras maximiza el potencial de tu contenido."
        },
        q2: {
          question: "¿Cómo funciona la IA?",
          answer: "Nuestra IA analiza tu entrada (tema, tono, audiencia objetivo) y genera pies de foto personalizados basados en las mejores prácticas actuales para cada plataforma. Aprende de millones de publicaciones exitosas."
        },
        q3: {
          question: "¿Puedo probarlo gratis?",
          answer: "¡Sí! Ofrecemos un plan gratuito con 20 pies de foto generados por IA al mes. No se requiere tarjeta de crédito para comenzar."
        },
        q4: {
          question: "¿Qué plataformas son compatibles?",
          answer: "CaptionGenie es compatible con Instagram, TikTok, Facebook, LinkedIn, Twitter/X y YouTube. Cada plataforma tiene su propio estilo de pie de foto optimizado."
        },
        q5: {
          question: "¿Puedo personalizar los pies de foto generados?",
          answer: "¡Por supuesto! Cada pie de foto generado es completamente editable. Úsalo tal cual o ajústalo para que coincida con tu voz única."
        },
        q6: {
          question: "¿Cómo cancelo mi suscripción?",
          answer: "Puedes cancelar en cualquier momento desde la configuración de tu cuenta. Tu acceso continúa hasta el final de tu período de facturación."
        }
      }
    },
    backToHome: "Volver al Inicio",
    footer_rights: "Todos los derechos reservados",
    platform: "Plataforma",
    language: "Idioma",
    
    // Cookie Consent
    consent: {
      banner: {
        title: "Valoramos tu privacidad",
        description: "Utilizamos cookies para mejorar nuestro sitio web, proporcionar estadísticas y mostrar contenido relevante. Puedes personalizar tus elecciones. Más información en nuestra Política de Privacidad.",
        privacyLink: "Política de Privacidad",
        imprintLink: "Aviso Legal",
        ariaLabel: "Banner de consentimiento de cookies"
      },
      buttons: {
        acceptAll: "Aceptar Todas",
        rejectAll: "Rechazar Todas",
        customize: "Personalizar",
        savePreferences: "Guardar Preferencias"
      },
      preferences: {
        title: "Preferencias de Cookies",
        description: "Gestiona tus configuraciones de cookies. Puedes cambiarlas en cualquier momento a través de Configuración de Cookies en el pie de página."
      },
      categories: {
        necessary: {
          title: "Cookies Necesarias",
          description: "Requeridas para funciones básicas del sitio (sesión, seguridad, consentimiento).",
          examples: "Cookies de sesión, tokens de seguridad, almacenamiento de consentimiento"
        },
        analytics: {
          title: "Estadísticas y Análisis",
          description: "Nos ayudan a entender cómo se utiliza el sitio web (anonimizado).",
          examples: "Google Analytics, estadísticas de uso, métricas de rendimiento"
        },
        marketing: {
          title: "Marketing y Publicidad",
          description: "Utilizadas para mostrar ofertas relevantes y retargeting.",
          examples: "Facebook Pixel, Google Ads, cookies de retargeting"
        },
        comfort: {
          title: "Comodidad y Personalización",
          description: "Funciones adicionales como medios integrados y personalización.",
          examples: "Vídeos de YouTube, contenido personalizado, preferencias guardadas"
        }
      },
      footer: {
        linkText: "Configuración de Cookies"
      }
    },
    characters: "Caracteres",
    copy: "Copiar",
    copied_to_clipboard: "Copiado al portapapeles",
    generating: "Generando...",
    success_title: "Éxito",
    error_title: "Error",
    error_auth: "Autenticación requerida",
    error_login_required: "Por favor inicia sesión para continuar",
    
    // Categories
    category: {
      create: "Crear",
      optimize: "Optimizar",
      analyze: "Analizar y Objetivos",
      design: "Diseño y Visuales"
    },
    
    // Hubs (New IA Structure)
    hubs: {
      planen: "Planificar",
      erstellen: "Crear",
      optimieren: "Optimizar",
      analysieren: "Analizar",
      automatisieren: "Automatizar",
      medien: "Medios",
      team: "Equipo",
      verwaltung: "Gestión"
    },
    
    // Dashboard
    dashboard: {
      statusBar: {
        tipOfTheDay: "Consejo del Día",
        connectedAccounts: "conectados",
        nextPost: "Próximo Post"
      },
      quickActions: {
        quickSchedule: "Planificar Rápido",
        openCalendar: "Abrir Calendario",
        postFromTemplate: "Post desde Plantilla",
        openPerformance: "Abrir Performance"
      },
      sections: {
        today: "Hoy",
        todayDescription: "Posts programados para hoy",
        thisWeek: "Esta Semana",
        thisWeekDescription: "Vista general de planificación para los próximos 7 días",
        performance: "Resumen de Performance",
        performanceDescription: "Sigue tus métricas clave de un vistazo",
        bestTimes: "Mejores Horarios",
        bestTimesDescription: "Horarios óptimos para máximo alcance",
        recentActivity: "Actividad Reciente",
        recentActivityDescription: "Tus acciones recientes de un vistazo"
      },
      emptyState: {
        noPosts: "No hay posts programados para hoy",
        createNow: "Crea un nuevo post ahora o usa la programación automática"
      },
      metrics: {
        reach7d: "Alcance (7 Días)",
        engagementRate: "Tasa de Engagement",
        publishedPosts: "Posts Publicados",
        vsLastWeek: "vs. semana pasada",
        avgAllPosts: "Promedio en todos los posts",
        thisMonth: "Este mes"
      },
      postActions: {
        open: "Abrir",
        publishNow: "Publicar Ahora",
        retry: "Reintentar"
      }
    },
    featureCards: {
      sectionTitle: "Características",
      sectionSubtitle: "Comienza con flujos de trabajo claros – en solo unos pasos.",
      automation: {
        title: "Automatización de Posts",
        description: "Planifica tu mes – publicación automática en el mejor momento."
      },
      analytics: {
        title: "Análisis de Rendimiento",
        description: "Descubre qué funciona – insights detallados para mejores decisiones."
      },
      brandKit: {
        title: "Kit de Marca y Consistencia",
        description: "Fuentes, colores, plantillas – publica de manera consistente con tu marca."
      },
      coach: {
        title: "Coach de Contenido IA",
        description: "Retroalimentación en tiempo real sobre captions, hashtags y tono."
      },
      publishing: {
        title: "Publicación Multi-Plataforma",
        description: "Publica simultáneamente en IG, TikTok, LinkedIn, X, YouTube."
      },
      goals: {
        title: "Objetivos y Logros",
        description: "Establece objetivos sociales, sigue el progreso, celebra hitos."
      }
    },
    heroBanner: {
      heading: "Planifica, publica y analiza posts sociales – más rápido con IA.",
      subheading: "Comienza gratis. Actualiza cuando quieras.",
      ctaPrimary: "Planificar Rápido",
      ctaSecondary: "Abrir Calendario",
      stats: {
        engagement: "Tasa de Engagement ↑",
        posts: "Posts Publicados",
        accounts: "Cuentas Conectadas"
      },
      trust: {
        title: "Cumple GDPR • Pago Seguro",
        subtitle: "Tus datos están seguros",
        integrations: "Integraciones"
      }
    },
    footer: {
      tagline: "Gestión de redes sociales con IA"
    },
    
    // Navigation (kept for compatibility)
    nav: {
      home: "Inicio",
      calendar: "Calendario Inteligente",
      composer: "Composer",
      postTimeAdvisor: "Asesor de Horarios",
      generator: "Generador AI de Captions",
      carousel: "Generador de Carrusel",
      promptWizard: "Asistente de Prompts",
      reelScript: "Script AI para Reels",
      hookGenerator: "Generador de Hooks",
      aiPostGenerator: "Generador AI de Posts",
      imageCaptionPairing: "Emparejamiento Imagen-Texto",
      backgroundReplacer: "Reemplazo de Fondo",
      rewriter: "Reescritor de Captions",
      coach: "Coach AI de Contenido",
      bioOptimizer: "Optimizador AI de Bio",
      commentManager: "Gestor AI de Comentarios",
      templateManager: "Gestor de Plantillas",
      performance: "Insights de Performance",
      analytics: "Panel de Analytics",
      analyticsAdvanced: "Analytics Avanzado",
      goals: "Panel de Objetivos",
      trendRadar: "Radar de Tendencias",
      allComments: "Todos los Comentarios",
      audit: "Auditoría de Contenido",
      campaigns: "Asistente de Campañas",
      integrations: "Integraciones",
      mediaLibrary: "Biblioteca de Medios",
      mediaProfiles: "Perfiles de Medios",
      teamWorkspace: "Espacio de Equipo",
      whiteLabel: "Marca Blanca",
      brandKit: "Kit de Marca",
      credits: "Créditos",
      account: "Cuenta",
      billing: "Facturación",
      pricing: "Precios",
      faq: "FAQ"
    },
    
    // Authentication
    auth: {
      login: "Iniciar Sesión",
      signup: "Registrarse",
      logout: "Cerrar Sesión",
      account: "Cuenta",
      loginTitle: "Inicia sesión en tu cuenta",
      signupTitle: "Crea tu cuenta",
      email: "Correo electrónico",
      password: "Contraseña"
    },
    
    // Common
    common: {
      error: "Error",
      success: "Éxito",
      cancel: "Cancelar",
      generating: "Generando...",
      uploading: "Subiendo...",
      language: "Idioma",
      comingSoon: "Próximamente",
      featureComingSoon: "¡Esta función estará disponible pronto!",
      upgradeRequired: "Se Requiere Actualización",
      upgradeToPro: "Actualizar a Pro",
      locked: "Bloqueado",
      requiresPro: "Requiere Plan Pro",
      getStarted: "Comenzar",
      startNow: "Empezar ahora"
    },
    
    // Hero section
    hero: {
      title: "Tu Plataforma de Gestión de Redes Sociales con IA",
      subtitle: "Crea, optimiza y analiza tu contenido – profesionalmente, eficientemente, escalable.",
      cta: "Empezar gratis",
      demo: "Ver demo",
      login: "Iniciar Sesión",
      tryFree: "Prueba Gratis"
    },

    // UI enhancements
    ui: {
      welcome: {
        greeting: "¡Bienvenido de nuevo, {name}!",
        weeklyProgress: "Has creado {count} publicaciones esta semana. ¡Te faltan {remaining} para tu meta!",
        tipOfTheDay: "Consejo del día",
        goal: "Para llegar a la meta!"
      },
      badge: {
        new: "Nuevo",
        pro: "Pro",
        cancelAnytime: "Cancelar en cualquier momento"
      },
      category: {
        createDesc: "Convierte ideas en contenido atractivo",
        optimizeDesc: "Perfecciona y programa tu contenido",
        analyzeDesc: "Rastrea el rendimiento y alcanza tus objetivos",
        designDesc: "Crea visuales de marca, carruseles y captions de imágenes"
      },
      trust: {
        cancelAnytime: "Cancelar en cualquier momento",
        securePayment: "Pago seguro",
        readyInSeconds: "Listo en 60 segundos"
      }
    },
    
    trends: {
      title: "Radar de Tendencias IA",
      subtitle: "Descubre tendencias virales, ideas de contenido y oportunidades de crecimiento para tu nicho",
      discover: "Descubrir",
      saved: "Guardado",
      discoverNiche: "Descubre tu Nicho",
      topTrends: "Top Tendencias de la Semana",
      topTrendsSubtitle: "Las tendencias más candentes ahora",
      allTrends: "Todas las Tendencias",
      search: "Buscar",
      searchPlaceholder: "Buscar tendencias, hashtags, productos...",
      ideas: "ideas",
      viewDetails: "Ver Detalles",
      analyzing: "Analizando...",
      popularity: "Popularidad",
      platform: "Plataforma",
      category: "Categoría",
      allPlatforms: "Todas las Plataformas",
      allCategories: "Todas las Categorías",
      niches: {
        socialMedia: "Crecimiento en Redes Sociales",
        ecommerce: "Viral para E-Commerce",
        lifestyle: "Estilo de Vida y Salud",
        business: "Negocios y Herramientas IA",
        motivation: "Motivación y Educación",
        finance: "Finanzas y Ingresos Extra",
      }
    },
    
    // Performance tracker
    performance: {
      title: "Rastreador de Rendimiento",
      subtitle: "Analiza el rendimiento de tus publicaciones en todas las plataformas",
      tabs: {
        overview: "Resumen",
        trends: "Tendencias de Engagement",
        insights: "Insights de Captions",
        connections: "Conexiones"
      },
      kpi: {
        avgEngagement: "Tasa Promedio de Engagement",
        totalPosts: "Publicaciones Analizadas",
        bestDay: "Mejor Día para Publicar",
        bestHour: "Mejor Hora para Publicar"
      },
      charts: {
        engagementOverTime: "Engagement a lo Largo del Tiempo",
        providerDistribution: "Distribución de Plataformas",
        topPosts: "Mejores Publicaciones por Engagement"
      },
      actions: {
        syncLatest: "Sincronizar Datos Recientes"
      },
      connections: {
        title: "Conexiones de Redes Sociales",
        description: "Conecta tus cuentas de redes sociales para sincronizar automáticamente los datos de rendimiento",
        connect: "Conectar",
        reconnect: "Reconectar",
        disconnect: "Desconectar",
        lastSync: "Última Sincronización",
        comingSoon: "Próximamente",
        oauthComingSoon: "Integración OAuth próximamente"
      },
      csv: {
        title: "Subida de CSV",
        description: "Sube tus métricas de publicaciones manualmente mediante archivo CSV",
        upload: "Subir CSV",
        uploadTitle: "Subir Métricas de Publicaciones",
        uploadDescription: "Importa datos de rendimiento desde un archivo CSV",
        formatInfo: "El CSV debe incluir: post_id, platform, posted_at y al menos una métrica",
        downloadTemplate: "Descargar Plantilla",
        selectFile: "Seleccionar Archivo CSV",
        selectedFile: "Archivo seleccionado",
        invalidFile: "Por favor selecciona un archivo CSV válido",
        noFile: "Por favor selecciona un archivo primero",
        noValidRows: "No se encontraron filas válidas en el CSV",
        uploadSuccess: "{count} publicaciones importadas exitosamente"
      },
      trends: {
        dayOfWeek: "Engagement por Día de la Semana",
        mediaType: "Engagement por Tipo de Medio",
        topPosts: "Top 20 Publicaciones"
      },
      table: {
        caption: "Caption",
        platform: "Plataforma",
        engagement: "Engagement",
        likes: "Me gusta",
        comments: "Comentarios",
        date: "Fecha",
        link: "Enlace"
      },
      insights: {
        title: "Insights de IA",
        subtitle: "Obtén recomendaciones impulsadas por IA para mejorar tu estrategia de contenido",
        generate: "Generar Nuevos Insights",
        generated: "Insights de IA generados exitosamente",
        empty: "Aún no hay insights. Genera tu primer análisis de IA.",
        generateFirst: "Generar Insights de IA",
        noPosts: "No se encontraron publicaciones",
        noPostsDescription: "Sube publicaciones antes de generar insights",
        summary: "Resumen de Rendimiento",
        topStyles: "Mejores Estilos de Caption",
        bestTimes: "Horarios Óptimos de Publicación",
        recommendations: "Recomendaciones Accionables",
        recalculate: "Recalcular",
        notEnoughData: "Aún no hay suficientes datos para insights (mín. 10 posts requeridos)",
        priority: {
          high: "Importante",
          medium: "Medio",
          low: "Opcional"
        }
      }
    },
    
    // Bio Optimizer
    bio_title: "Optimizador de Bio con IA",
    bio_input_audience: "Audiencia objetivo",
    bio_input_topic: "Enfoque / Nicho",
    bio_input_tone: "Tono / Personalidad",
    bio_input_keywords: "Palabras clave (Opcional)",
    bio_generate: "Generar bio",
    bio_explanation: "Por qué funciona",
    bio_copy: "Copiar bio",
    bio_preview: "Vista previa del perfil",
    bio_regenerate: "Regenerar",
    bio_brand_voice: "Voz de marca",
    bio_save_brand_voice: "Guardar voz de marca",
    bio_apply_brand_voice: "Aplicar voz de marca guardada",
    bio_history_title: "Bios recientes",
    bio_limit_reached: "Límite diario alcanzado. Actualiza a Pro para generación ilimitada de bios.",
    bio_tone_friendly: "Amigable",
    bio_tone_professional: "Profesional",
    bio_tone_bold: "Audaz",
    bio_tone_humorous: "Humorístico",
    bio_tone_inspirational: "Inspirador",
    
    // Image Caption Pairing
    image_caption_title: "Emparejamiento de Subtítulos de Imagen con IA",
    image_caption_subtitle: "Sube una imagen y obtén subtítulos generados por IA",
    upload_image: "Subir imagen",
    drag_drop_image: "Arrastra y suelta tu imagen aquí o haz clic para buscar",
    analyzing_image: "Analizando imagen...",
    generate_captions: "Generar subtítulos",
    generating_captions: "Generando subtítulos...",
    regenerate: "Regenerar",
    copy_caption: "Copiar subtítulo",
    use_in_generator: "Usar en generador",
    caption_copied: "¡Subtítulo copiado al portapapeles!",
    image_analysis: "Análisis de imagen",
    detected_objects: "Objetos detectados",
    scene_type: "Tipo de escena",
    emotion: "Emoción",
    theme: "Tema",
    caption_style_emotional: "Emocional",
    caption_style_funny: "Gracioso",
    caption_style_minimal: "Minimal",
    caption_style_storytelling: "Narrativo",
    caption_style_engagement: "Engagement",
    upload_error: "Error al subir la imagen",
    analysis_error: "Error al analizar la imagen",
    select_platform: "Seleccionar plataforma",
    history_title: "Subidas recientes",
    no_history: "Aún no hay subidas recientes",
    delete_item: "Eliminar",
    image_caption_limit_reached: "Límite diario alcanzado. Actualiza a Pro para subidas ilimitadas.",
    max_file_size: "Tamaño máximo de archivo: 10 MB",
    supported_formats: "Soportado: JPEG, PNG, WebP",
    
    // Brand Kit
    brand_kit_title: "Kit de Marca Automático",
    brand_kit_subtitle: "Sube tu logotipo y define tu identidad de marca",
    brand_kit_upload_logo: "Subir logotipo",
    brand_kit_primary_color: "Color principal",
    brand_kit_secondary_color: "Color secundario (Opcional)",
    brand_kit_description: "Descripción de marca",
    brand_kit_description_placeholder: "Ej., Marca de fitness divertida para mujeres 25-35",
    brand_kit_tone: "Preferencia de tono",
    brand_kit_tone_modern: "Moderno",
    brand_kit_tone_minimalist: "Minimalista",
    brand_kit_tone_playful: "Divertido",
    brand_kit_tone_elegant: "Elegante",
    brand_kit_tone_bold: "Audaz",
    brand_kit_generate: "Generar Kit de Marca",
    brand_kit_regenerate: "Regenerar",
    brand_kit_generating: "Generando tu kit de marca...",
    brand_kit_color_palette: "Paleta de colores",
    brand_kit_font_pairing: "Combinación de fuentes",
    brand_kit_headline_font: "Título",
    brand_kit_body_font: "Cuerpo",
    brand_kit_mood: "Estado de ánimo",
    brand_kit_keywords: "Palabras clave",
    brand_kit_usage: "Consejos de uso",
    brand_kit_ai_insight: "Por qué encaja con tu marca",
    brand_kit_copy_hex: "Copiar HEX",
    brand_kit_copied: "¡Copiado!",
    brand_kit_my_kits: "Mis Kits de Marca",
    brand_kit_no_kits: "Aún no hay kits de marca",
    brand_kit_create_first: "Crea tu primer kit de marca para comenzar",
    brand_kit_delete_confirm: "¿Estás seguro de que quieres eliminar este kit de marca?",
    
    // Carousel Generator
    carousel_title: "Generador de Carrusel",
    carousel_subtitle: "Transforma texto en presentaciones atractivas",
    carousel_input_label: "Tu Contenido",
    carousel_input_placeholder: "Pega tu texto o viñetas aquí (2-2.500 caracteres)...",
    carousel_slide_count: "Número de Diapositivas",
    carousel_platform: "Plataforma",
    carousel_style: "Plantilla de Estilo",
    carousel_brand_kit: "Kit de Marca",
    carousel_brand_kit_default: "Usar tema predeterminado",
    carousel_cta_toggle: "Incluir diapositiva de CTA",
    carousel_generate: "Generar Diapositivas",
    carousel_improve: "Mejorar Legibilidad",
    carousel_regenerate: "Regenerar Esquema",
    carousel_export_png: "Exportar PNG",
    carousel_export_pdf: "Exportar PDF",
    carousel_reorder: "Arrastra para reordenar",
    carousel_add_slide: "Añadir Diapositiva",
    carousel_remove_slide: "Eliminar Diapositiva",
    carousel_edit_slide: "Clic para editar",
    carousel_slide_title: "Título",
    carousel_slide_bullets: "Viñetas",
    carousel_no_projects: "Aún no hay proyectos de carrusel guardados",
    carousel_saved_projects: "Proyectos Guardados",
    carousel_load_project: "Cargar",
    carousel_delete_project: "Eliminar",
    carousel_save_project: "Guardar Proyecto",
    carousel_watermark_info: "El plan gratuito incluye marca de agua",
    carousel_upgrade_for_more: "Mejora a Pro para 10 diapositivas, exportación PDF y sin marca de agua",
    carousel_pdf_pro_only: "La exportación PDF es una función Pro",
    
    // AI Content Coach
    coach_title: "Entrenador de Contenido IA",
    coach_subtitle: "Obtén consejos de estrategia personalizados de tu mentor de IA",
    coach_input_placeholder: "Pregúntame cualquier cosa sobre tu estrategia de contenido...",
    coach_send: "Enviar",
    coach_reset: "Reiniciar conversación",
    coach_export: "Exportar chat (PDF)",
    coach_typing: "El entrenador está escribiendo...",
    coach_limit_reached: "Límite diario alcanzado (5 mensajes). Mejora a Pro para coaching ilimitado.",
    coach_quick_prompts: "Preguntas rápidas",
    coach_prompt_1: "¿Cómo puedo duplicar mi alcance en LinkedIn?",
    coach_prompt_2: "Dame 3 ideas para Reels virales esta semana",
    coach_prompt_3: "¿Cuál es el mejor horario de publicación para una marca tecnológica?",
    coach_prompt_4: "Reescribe mi subtítulo para más engagement",
    coach_no_messages: "Comienza una conversación con tu Entrenador de Contenido IA",
    coach_new_session: "Nueva conversación",
    
    // AI Campaign Assistant
    campaign_title: "Asistente de Campañas IA",
    campaign_subtitle: "Planifica campañas completas con estrategias generadas por IA",
    campaign_goal_label: "Objetivo de la campaña",
    campaign_goal_placeholder: "Ej., Promocionar mi nuevo eBook sobre alimentación saludable",
    campaign_topic_label: "Tema",
    campaign_topic_placeholder: "Ej., Desafío de fitness, Herramientas IA para pequeñas empresas",
    campaign_duration_label: "Duración (semanas)",
    campaign_platform_label: "Plataforma(s)",
    campaign_audience_label: "Audiencia objetivo (opcional)",
    campaign_audience_placeholder: "Ej., jóvenes profesionales en tecnología",
    campaign_tone_label: "Tono de voz",
    campaign_tone_friendly: "Amigable",
    campaign_tone_bold: "Audaz",
    campaign_tone_educational: "Educativo",
    campaign_tone_emotional: "Emocional",
    campaign_tone_corporate: "Corporativo",
    campaign_frequency_label: "Publicaciones por semana",
    campaign_generate: "Generar plan de campaña",
    campaign_generating: "Generando campaña...",
    campaign_summary: "Resumen de la campaña",
    campaign_week: "Semana",
    campaign_theme: "Tema",
    campaign_day: "Día",
    campaign_type: "Tipo",
    campaign_title_col: "Título",
    campaign_caption: "Esquema de subtítulo",
    campaign_hashtags: "Hashtags",
    campaign_cta: "CTA",
    campaign_best_time: "Mejor hora",
    campaign_send_to_calendar: "Añadir al calendario",
    campaign_open_generator: "Abrir en generador",
    campaign_hashtag_strategy: "Estrategia de hashtags",
    campaign_posting_tips: "Consejos de publicación",
    campaign_export_pdf: "Exportar PDF",
    campaign_delete: "Eliminar campaña",
    campaign_my_campaigns: "Mis campañas",
    campaign_no_campaigns: "Aún no hay campañas. ¡Crea tu primera campaña!",
    campaign_limit_reached: "El plan gratuito permite 1 campaña (máx. 1 semana). Mejora a Pro para campañas ilimitadas hasta 8 semanas.",
    campaign_created: "¡Campaña creada exitosamente!",
    campaign_deleted: "Campaña eliminada",
    campaign_added_to_calendar: "Publicaciones añadidas al calendario",
    
    // Content Audit
    audit_title: "Herramienta de Auditoría de Contenido",
    audit_subtitle: "Analiza tus subtítulos para potencial de interacción con insights impulsados por IA",
    audit_input_label: "Ingresa tus subtítulos",
    audit_input_placeholder: "Pega tu subtítulo aquí...\n\nPara múltiples subtítulos, sepáralos con ---",
    audit_platform_label: "Plataforma",
    audit_analyze_button: "Analizar subtítulos",
    audit_analyzing: "Analizando tu contenido...",
    audit_results_title: "Resultados del análisis",
    audit_avg_score: "Puntuación promedio de interacción",
    audit_caption_preview: "Subtítulo",
    audit_emotion: "Emoción",
    audit_cta_strength: "Fuerza del CTA",
    audit_engagement_score: "Puntuación",
    audit_suggestions: "Sugerencias",
    audit_overall_feedback: "Comentarios generales",
    audit_history_title: "Auditorías anteriores",
    audit_no_history: "Aún no hay historial de auditorías",
    audit_delete: "Eliminar",
    audit_limit_reached: "Límite diario alcanzado",
    audit_upgrade_message: "Los usuarios gratuitos pueden analizar hasta 3 subtítulos por día. Actualiza a Pro para auditorías ilimitadas.",
    audit_strong: "Fuerte",
    audit_weak: "Débil",
    audit_missing: "Faltante",
    audit_word_count: "Palabras",
    audit_reading_level: "Nivel de lectura",
    
    // AI Post Generator
    aipost_title: "Generador de Publicaciones IA",
    aipost_subtitle: "Transforma imágenes en publicaciones sociales completas con diseño impulsado por IA",
    aipost_upload_image: "Subir imagen",
    aipost_description: "Breve descripción",
    aipost_description_placeholder: "Ej. Promoción de nuevo batido de proteínas",
    aipost_platforms: "Plataformas",
    aipost_style: "Estilo preestablecido",
    aipost_tone: "Tono de voz",
    aipost_brand_kit: "Kit de marca",
    aipost_cta: "Llamada a la acción (opcional)",
    aipost_cta_placeholder: "Ej. Comprar ahora, Envía un DM",
    aipost_generate_button: "Generar publicación completa",
    aipost_generating: "Generando tu publicación...",
    aipost_preview: "Vista previa",
    aipost_headline: "Titular",
    aipost_caption: "Subtítulo",
    aipost_hashtags: "Hashtags",
    aipost_copy_caption: "Copiar subtítulo",
    aipost_download: "Descargar",
    aipost_send_to_calendar: "Enviar al calendario",
    aipost_open_in_generator: "Abrir en generador",
    aipost_history: "Historial",
    aipost_no_history: "Aún no hay publicaciones generadas",
    aipost_style_clean: "Limpio",
    aipost_style_bold: "Audaz",
    aipost_style_lifestyle: "Estilo de vida",
    aipost_style_elegant: "Elegante",
    aipost_style_corporate: "Corporativo",
    aipost_tone_friendly: "Amigable",
    aipost_tone_informative: "Informativo",
    aipost_tone_persuasive: "Persuasivo",
    aipost_tone_playful: "Juguetón",
    aipost_tone_professional: "Profesional",
    
    // Background Replacer
    bg_title: "Reemplazador de Fondo IA",
    bg_subtitle: "Transforma fotos de productos con fondos temáticos generados por IA",
    bg_upload_product: "Subir imagen del producto",
    bg_choose_theme: "Elegir tema",
    bg_lighting: "Preferencia de iluminación",
    bg_style_intensity: "Fuerza del estilo",
    bg_generate_scenes: "Generar escenas",
    bg_generating: "Generando 10 variantes...",
    bg_preview: "Galería de vista previa",
    bg_download_selected: "Descargar seleccionados",
    bg_download_all: "Descargar todo (ZIP)",
    bg_use_in_post: "Usar en generador de publicaciones",
    bg_schedule: "Programar publicación",
    bg_history: "Proyectos recientes",
    bg_no_history: "Aún no hay proyectos",
    bg_removing_bg: "Eliminando fondo...",
    bg_theme_outdoor: "Exterior / Naturaleza",
    bg_theme_workspace: "Espacio de trabajo profesional",
    bg_theme_studio: "Estudio minimalista",
    bg_theme_urban: "Estilo de vida urbano",
    bg_theme_home: "Interior del hogar",
    bg_theme_retail: "Comercio / Estante",
    bg_theme_kitchen: "Cocina / Preparación de alimentos",
    bg_theme_abstract: "Gradiente abstracto",
    bg_lighting_natural: "Natural",
    bg_lighting_studio: "Estudio suave",
    bg_lighting_dramatic: "Dramático",
    bg_lighting_neutral: "Neutral",
    bg_limit_reached: "Límite diario alcanzado. Actualiza a Pro para generaciones ilimitadas.",
    bg_pro_themes: "Temas Pro: Todos los 8 temas disponibles",
    
    // Reel Script Generator
    reelScript: {
      title: "Generador de guiones IA",
      subtitle: "Convierte ideas en guiones de video listos para grabar con desglose de escenas",
      input_section: "Detalles del guion",
      input_description: "Proporciona tu idea de video y crearemos un guion completo",
      idea_label: "Idea o subtítulo",
      idea_placeholder: "ej., Quiero hacer un Reel sobre batidos saludables",
      platform: "Plataforma",
      duration: "Duración del video",
      tone: "Tono de voz",
      brand_kit: "Kit de marca (opcional)",
      language_label: "Idioma",
      generate_button: "Generar guion",
      generating: "Creando tu guion...",
      free_limit: "Gratis: 2 guiones/día • Pro: Ilimitado",
      limit_reached: "Límite diario alcanzado",
      upgrade_message: "Actualiza a Pro para generación ilimitada de guiones",
      no_script: "Tu guion generado aparecerá aquí",
      empty_state_hint: "Completa tu idea arriba y haz clic en 'Generar guion' para crear un guion de video profesional con timing exacto, voice-over, texto en pantalla y sugerencias de tomas.",
      caption: "Subtítulo de publicación",
      copy_caption: "Copiar subtítulo",
      next_steps: "Próximos pasos",
      send_to_calendar: "Añadir al calendario",
      send_to_post: "Crear publicación visual",
      export_pdf: "Exportar como PDF (Pro)",
      beats_timeline: "Línea de Tiempo de Beats",
      beats_description: "Sigue este desglose beat por beat para crear tu video",
      voiceover: "Voice-over",
      onscreen: "En Pantalla",
      shot: "Toma",
      cta_broll: "Call-to-Action y B-Roll",
      call_to_action: "Call-to-Action",
      broll_suggestions: "Sugerencias de B-Roll",
      hashtags: "Hashtags",
      copy_sections: "Copiar Secciones",
      copy_vo: "Voice-over",
      copy_onscreen: "Texto en Pantalla",
      copy_shots: "Lista de Tomas",
      copy_hashtags: "Hashtags",
      download_txt: "Descargar .txt",
      copied: "copiado",
      downloaded: "Guion descargado",
      success: "¡Guion generado!",
      script_ready: "Tu guion está listo para usar",
      fallback_used: "Guion de respaldo generado",
      fallback_description: "Generado con respaldo - listo para usar inmediatamente o reintentar",
      fallback_banner: "Esta es una versión de respaldo. Está lista para usar inmediatamente o puedes intentar regenerar.",
      retrying: "Reintentando...",
      rate_limit_retry: "Límite de velocidad alcanzado, reintentando en 1.5 segundos",
      error_empty_idea: "Idea requerida",
      error_idea_too_short: "Por favor, ingresa al menos 10 caracteres para tu idea de video",
      error_idea_too_long: "Idea demasiado larga",
      error_max_1500: "La idea debe tener un máximo de 1500 caracteres.",
      request_id: "ID de solicitud",
      error_auth_required: "Autenticación requerida",
      error_please_login: "Por favor inicia sesión para crear guiones",
      error_validation: "Entrada inválida",
      error_check_inputs: "Por favor verifica tus entradas (longitud de idea, plataforma, duración)",
      error_rate_limit: "Límite de velocidad alcanzado",
      error_wait_retry: "Demasiadas solicitudes. Por favor espera 30-60 segundos e intenta nuevamente.",
      error_payment: "Créditos requeridos",
      error_add_credits: "Créditos del servicio de IA agotados. Por favor añade créditos para continuar.",
      error_failed: "Generación fallida",
      error_unexpected: "Error inesperado al generar el guion. Nuestro equipo ha sido notificado.",
    },
    
    // Comment Manager
    commentManager: {
      title: "Gestor de Comentarios IA",
      subtitle: "Gestiona comentarios con sugerencias de respuesta con IA",
      import_label: "Importar comentarios",
      import_description: "Sube comentarios para análisis y sugerencias de respuesta",
      platform: "Plataforma",
      brand_tone: "Tono de marca",
      manual_input: "Comentarios",
      input_placeholder: "Pega comentarios (uno por línea):\nnombre_usuario | texto del comentario",
      input_format: "Formato: nombre_usuario | texto del comentario (uno por línea)",
      analyze_button: "Analizar comentarios",
      analyzing: "Analizando comentarios...",
      free_limit: "Gratis: 20 comentarios/día • Pro: Ilimitado + Respuesta automática",
      limit_reached: "Límite diario alcanzado",
      upgrade_message: "Actualiza a Pro para análisis ilimitado de comentarios",
      comments_list: "Comentarios y respuestas",
      total_comments: "comentarios",
      no_comments: "Aún no hay comentarios. Importa comentarios para comenzar.",
    },
    
    // Generator
    generator_title: "Generador de Texto",
    generator_card_title: "Genera tu Caption",
    generator_card_description: "Completa los detalles para crear el pie de foto perfecto para redes sociales",
    usage_counter: "{used}/{total} captions hoy",
    input_topic: "Tema o idea",
    input_tone: "Tono",
    input_platform: "Plataforma",
    btn_generate: "Crear ahora",
    btn_copy: "Copiar",
    btn_new: "Nueva idea",
    input_topic_placeholder: "Ejemplo: Batido saludable para la mañana",
    generator_error_empty_topic: "Por favor, introduce un tema o idea.",
    generator_error_auth_required: "Por favor, inicia sesión para crear subtítulos.",
    generator_error_invalid_input: "Por favor, verifica tus entradas.",
    generator_error_rate_limit: "Demasiadas solicitudes. Por favor, espera un momento e inténtalo de nuevo.",
    generator_error_limit_reached: "Límite diario alcanzado. Actualiza a Pro para generaciones ilimitadas.",
    generator_error_payment_required: "Créditos de IA agotados. Por favor, añade créditos.",
    generator_error_service_unavailable: "Servicio temporalmente no disponible. Por favor, inténtalo más tarde.",
    generator_error_unexpected: "Error inesperado al crear el subtítulo. Por favor, inténtalo más tarde.",
    generator_error_retrying: "Reintentando solicitud...",
    
    // Tone options
    tone_friendly: "Amigable",
    tone_professional: "Profesional",
    tone_funny: "Divertido",
    tone_emotional: "Emocional",
    tone_bold: "Audaz",
    tone_inspirational: "Inspirador",
    tone_casual: "Casual",
    tone_formal: "Formal",
    tone_informative: "Informativo",
    tone_playful: "Juguetón",
    
    // Prompt Wizard
    wizard: {
      title: "Asistente de Prompts",
      subtitle: "Crea entradas de IA específicas para mejores resultados.",
      infoTitle: "Prompts optimizados para tus herramientas de IA",
      infoDescription: "Crea prompts personalizados para mejores resultados de IA",
      platform: "Plataforma",
      goal: "Objetivo",
      businessType: "Tipo de Negocio / Industria",
      tone: "Tono",
      keywords: "Palabras Clave",
      generate: "Generar Prompt",
      selectPlatform: "Seleccionar plataforma",
      selectGoal: "Seleccionar objetivo",
      selectTone: "Seleccionar tono",
      businessPlaceholder: "ej. Coaching, E-Commerce, Fitness",
      keywordsPlaceholder: "Ingresar palabras clave (ej. Marketing, Fitness, Motivación)",
      fillFields: "Por favor completa todos los campos requeridos",
      generating: "Generando prompt...",
      success: "¡Prompt generado exitosamente!",
      moreReach: "Más Alcance",
      engagement: "Mayor Engagement",
      sales: "Impulsar Ventas",
      awareness: "Conocimiento de Marca",
      growth: "Crecimiento de Seguidores",
      results: "Prompt Generado",
      optimizedPrompt: "Prompt Optimizado",
      whyItWorks: "Por Qué Funciona",
      example: "Caption de Ejemplo",
      useInGenerator: "Usar en Generador",
      copyPrompt: "Copiar Prompt",
      newIdea: "Nueva Idea",
      copied: "¡Prompt copiado al portapapeles!"
    },
    
    // Hook Generator
    hooks: {
      title: "Generador de Hooks",
      subtitle: "Encuentra aperturas que capten la atención para tus publicaciones",
      usageCounter: "Hooks creados: {used}/{total} hoy",
      inputTitle: "Tema o contenido",
      inputDescription: "Ingresa tu tema y elige plataforma y tono",
      topic: "Tema",
      platform: "Plataforma",
      tone: "Tono",
      audience: "Público Objetivo",
      styles: "Estilos de Hook",
      generate: "Generar Hooks",
      topicPlaceholder: "Ejemplo: Motivación para el lunes por la mañana",
      audiencePlaceholder: "Ingresar público objetivo",
      selectPlatform: "Seleccionar plataforma",
      selectTone: "Seleccionar tono",
      styleCuriosity: "Curiosidad",
      styleProvocation: "Provocación",
      styleRelatable: "Cercano",
      styleHumor: "Humor",
      styleAuthority: "Autoridad",
      results: "Hooks Generados",
      chars: "caracteres",
      copy: "Copiar",
      copyAll: "Copiar Todo",
      copiedAll: "¡Todos los hooks copiados!",
      copied: "¡Hook copiado!",
      useInGenerator: "Usar en Generador",
      generating: "Generando...",
      success: "¡Hooks generados!",
      regenerated: "¡Hooks regenerados!",
      fillFields: "Por favor completa todos los campos",
      selectStyle: "Por favor selecciona al menos un estilo",
      limitTitle: "Límite Diario Alcanzado",
      limitMessage: "Has alcanzado tu límite diario gratuito de hooks. Actualiza a Pro para acceso ilimitado.",
      helperText: "Consejo: Usa estos hooks como líneas de apertura para tus captions"
    },
    
    // Rewriter
    rewriter_title: "Reescritor de Captions",
    rewriter_subtitle: "Mejora o cambia publicaciones existentes con IA",
    rewriter_original_caption: "Pega tu caption aquí",
    rewriter_placeholder: "Ejemplo: Comienza tu día con una sonrisa y una buena taza de café.",
    rewriter_goal_label: "Objetivo",
    rewriter_goal_viral: "Viral",
    rewriter_goal_emotional: "Emocional",
    rewriter_goal_professional: "Profesional",
    rewriter_goal_simplify: "Simplificar",
    rewriter_goal_tooltip: "Elige el objetivo deseado para reescribir",
    rewriter_button: "Reescribir",
    rewriter_empty_state: "Aún no hay caption reescrita",
    rewriter_result_title: "Caption Reescrita",
    rewriter_why_works: "Por Qué Funciona",
    rewriter_suggestions: "Sugerencias Adicionales",
    rewriter_success: "Caption reescrita exitosamente",
    rewriter_error_empty: "Por favor ingresa texto",
    rewriter_error_generic: "Ocurrió un error durante la reescritura",
    rewriter_limit_title: "Límite Diario Alcanzado",
    rewriter_limit_message: "Actualiza a Pro para reescrituras ilimitadas",
    rewriter_usage_counter: "{count}/{limit} reescrituras usadas hoy",
    rewriter_use_in_generator: "Usar en Generador",
    rewriter_pro_feature: "Función Pro - Actualiza para acceso",
    
    // Posting Time Advisor
    advisor: {
      title: "Asesor de Hora de Publicación",
      subtitle: "Analiza tu mejor hora de publicación para más alcance",
      platform: "Plataforma",
      timezone: "Zona horaria",
      niche: "Área temática",
      goal: "Objetivo",
      analyze: "Iniciar análisis",
      selectGoal: "Seleccionar objetivo (ej., más engagement)",
      selectPlatform: "Seleccionar plataforma",
      infoTitle: "Encuentra tus Horarios Óptimos de Publicación",
      infoDescription: "Analiza las mejores horas para publicar y obtener máximo alcance y engagement",
      nichePlaceholder: "Seleccionar área temática (ej., Fitness, Moda, Marketing)",
      fillFields: "Por favor completa todos los campos requeridos",
      success: "¡Análisis completado exitosamente!",
      copied: "¡Horarios de publicación copiados al portapapeles!",
      bestTimes: "Mejores Horarios para Publicar",
      explanation: "Explicación del Análisis",
      proTips: "Consejos Pro"
    },
    
    // Authentication
    auth_login_title: 'Iniciar sesión',
    auth_signup_title: 'Registrarse',
    auth_email: 'Correo electrónico',
    auth_password: 'Contraseña',
    auth_password_confirm: 'Confirmar contraseña',
    auth_no_account: '¿No tienes cuenta?',
    auth_have_account: '¿Ya tienes una cuenta?',
    auth_welcome_back: '¡Bienvenido de nuevo!',
    auth_welcome_new: '¡Bienvenido a CaptionGenie!',
    auth_show_password: 'Mostrar contraseña',
    auth_hide_password: 'Ocultar contraseña',
    auth_remember_me: 'Recordarme',
    auth_forgot_password: '¿Olvidaste tu contraseña?',
    auth_login_description: 'Inicia sesión en tu cuenta',
    auth_signup_description: 'Crea tu cuenta gratuita',
    
    // Global Buttons
    btn_analyze: "Analizar",
    btn_save: "Guardar",
    btn_cancel: "Cancelar",
    btn_download: "Descargar",
    btn_export: "Exportar",
    btn_upload: "Subir",
    btn_login: "Iniciar sesión",
    btn_signup: "Registrarse",
    btn_logout: "Cerrar sesión",
    btn_try: "Probar ahora",
    btn_start: "Empezar ahora",
    
    // Comments
    comments: {
      replySuggestions: "Sugerencias de Respuesta",
      replySuggestionsGenerated: "Sugerencias generadas",
      replySuggestionsDesc: "Elige el estilo que mejor se adapte",
      replySuggestionsFailed: "Error al generar sugerencias",
      generateReplies: "Sugerencias de Respuesta IA",
      generateRepliesButton: "Generar Respuestas",
      regenerateReplies: "Regenerar Sugerencias",
      copyReply: "Copiar respuesta",
      copiedToClipboard: "Copiado al portapapeles",
      replyTypeFriendly: "Amigable",
      replyTypePromo: "Promocional",
      replyTypeCasual: "Casual"
    },
    
    pricingPage: {
      title: "Crece con CaptionGenie",
      subtitle: "Elige el plan que se adapte a tu flujo de trabajo. Mejora en cualquier momento.",
      plans: {
        basic: {
          name: "Básico",
          price: "14,99 €",
          period: "mes",
          credits: "800 créditos por mes",
          features: [
            "Todas las plantillas premium",
            "Generador de hashtags",
            "Gestiona hasta 2 marcas",
            "Programación manual de publicaciones"
          ],
          button: "Actualizar a Básico"
        },
        pro: {
          name: "Pro",
          price: "34,99 €",
          period: "mes",
          credits: "2.500 créditos por mes",
          features: [
            "Todo lo de Básico",
            "Programación automática con IA",
            "Modelos de IA avanzados",
            "Herramientas de colaboración de equipo",
            "Panel de análisis"
          ],
          button: "Hazte Pro"
        },
        enterprise: {
          name: "Empresarial",
          price: "69,99 €",
          period: "mes",
          credits: "Créditos ilimitados",
          badge: "Nivel superior",
          features: [
            "Todo lo de Pro",
            "Acceso API e integraciones",
            "Soporte prioritario",
            "Herramientas de agencia y marca blanca"
          ],
          button: "Obtener Enterprise"
        }
      }
    },
    
    pricing: {
      promo: {
        placeholder: "Ingresar código promocional",
        apply: "Aplicar",
        invalid: "Código promocional inválido",
        error: "Error al validar el código",
        applied: "Código aplicado",
        for3months: "por 3 meses",
        hint: "Con código Creator: −30% por 3 meses • El Creator recibe 20% de comisión"
      },
      intro: {
        basic: "Mes introductorio: Solo 4,99 € en lugar de 14,99 €",
        enterprise: "Mes introductorio: Solo 9,99 € en lugar de 69,99 €",
        monthly: "Cancelable en cualquier momento"
      },
      features: {
        quickPostLocked: "Publicación rápida en calendario (Función Pro)",
        quickPostDesc: "Planifica publicaciones con un clic: mejora a Pro o Enterprise para desbloquear esta función.",
        autoScheduleLocked: "Programación automática con IA (Función Pro)",
        autoScheduleDesc: "Deja que la IA encuentre automáticamente los mejores momentos para publicar: disponible en planes Pro y Enterprise."
      },
      upgrade: {
        toPro: "Mejorar a Pro",
        toEnterprise: "Mejorar a Enterprise"
      }
    }
  }
};

export const detectBrowserLanguage = (): Language => {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('de')) return 'de';
  if (browserLang.startsWith('es')) return 'es';
  return 'en';
};