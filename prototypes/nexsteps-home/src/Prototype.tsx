import { useState, type ComponentType } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AvatarIcon,
  BarChartIcon,
  BellIcon,
  CalendarIcon,
  ChatBubbleIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  Cross2Icon,
  FileTextIcon,
  GlobeIcon,
  HomeIcon,
  LockClosedIcon,
  PersonIcon,
} from "@radix-ui/react-icons";
import { MobileScroll } from "./mobile";
import {
  firstScreenByTab,
  flowGroups,
  screensById,
  wireframeScreens,
  type AppTab,
  type Tone,
  type WireframeBlock,
  type WireframeScreen,
} from "./wireframes-data";

const tabIcons: Record<AppTab, ComponentType> = {
  Week: CalendarIcon,
  Today: HomeIcon,
  Community: ChatBubbleIcon,
  Progress: BarChartIcon,
  Family: PersonIcon,
};

const secondaryTargets: Partial<Record<string, string>> = {
  welcome: "account-create",
  "account-create": "account-recover",
  "account-recover": "account-create",
  "community-preview": "week-home",
  "community-join": "community-preview",
  "community-privacy-preview": "community-join",
  "household-profile": "family-directory",
  "send-hello": "household-profile",
  "private-intro": "block-report",
  "meetup-list": "meetup-create",
  "meetup-detail": "private-intro",
  membership: "privacy-data",
  "account-session": "welcome",
  "regulations-overview": "regulations-jurisdiction",
  "regulations-requirement-detail": "regulations-requirements",
  "regulations-evidence-upload": "regulations-evidence",
  "regulations-update-detail": "regulations-updates",
  "regulations-correspondence-detail": "regulations-correspondence",
  "regulations-correspondence-add": "regulations-correspondence",
  "regulations-pack-scope": "regulations-correspondence-detail",
  "regulations-pack-evidence": "regulations-pack-scope",
  "regulations-pack-preview": "regulations-pack-evidence",
  "regulations-pack-share": "regulations-pack-preview",
  "regulations-share-confirmation": "regulations-pack-share",
  "regulations-share-activity": "regulations-overview",
  "moderation-report": "moderation-resolution",
  "moderation-resolution": "moderation-report",
};

function goToTop() {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(".mobile-scroll")
      ?.scrollTo({ top: 0, behavior: "smooth" });
  });
}

export default function Prototype() {
  const [activeId, setActiveId] = useState("welcome");
  const [showIndex, setShowIndex] = useState(false);
  const activeScreen = screensById.get(activeId) ?? wireframeScreens[0];
  const activeIndex = wireframeScreens.findIndex(
    (screen) => screen.id === activeScreen.id,
  );

  const navigate = (id: string) => {
    if (!screensById.has(id)) return;
    setActiveId(id);
    setShowIndex(false);
    goToTop();
  };

  const move = (direction: -1 | 1) => {
    const target =
      wireframeScreens[
        (activeIndex + direction + wireframeScreens.length) %
          wireframeScreens.length
      ];
    navigate(target.id);
  };

  return (
    <div className="prototype-shell">
      <MobileScroll className="app-screen">
        {showIndex ? (
          <FlowIndex
            activeId={activeId}
            onClose={() => setShowIndex(false)}
            onNavigate={navigate}
          />
        ) : (
          <main
            className={`screen-content ${activeScreen.tab ? "has-bottom-nav" : ""}`}
            data-testid="wireframe-screen"
            data-screen-id={activeScreen.id}
            aria-label={`${activeScreen.title} wireframe`}
          >
            <ReviewBar
              current={activeIndex + 1}
              total={wireframeScreens.length}
              onBack={() => move(-1)}
              onNext={() => move(1)}
              onIndex={() => setShowIndex(true)}
            />
            <ScreenHeader screen={activeScreen} />
            <section className="screen-blocks">
              {activeScreen.blocks.map((block, index) => (
                <Block
                  key={`${activeScreen.id}-${index}`}
                  block={block}
                  onNavigate={navigate}
                />
              ))}
            </section>
            <ScreenActions
              screen={activeScreen}
              onPrimary={() =>
                activeScreen.primaryTarget &&
                navigate(activeScreen.primaryTarget)
              }
              onSecondary={() => {
                const target = secondaryTargets[activeScreen.id];
                if (target) navigate(target);
              }}
            />
          </main>
        )}
      </MobileScroll>
      {!showIndex && activeScreen.tab ? (
        <BottomNavigation
          active={activeScreen.tab}
          onNavigate={(tab) => navigate(firstScreenByTab[tab])}
        />
      ) : null}
    </div>
  );
}

function ReviewBar({
  current,
  total,
  onBack,
  onNext,
  onIndex,
}: {
  current: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  onIndex: () => void;
}) {
  return (
    <div className="review-bar" aria-label="Wireframe review controls">
      <button
        type="button"
        className="review-icon-button"
        aria-label="Previous wireframe"
        onClick={onBack}
      >
        <ArrowLeftIcon />
      </button>
      <button type="button" className="review-index-button" onClick={onIndex}>
        <span>All screens</span>
        <span className="review-count">
          {current}/{total}
        </span>
      </button>
      <button
        type="button"
        className="review-icon-button"
        aria-label="Next wireframe"
        onClick={onNext}
      >
        <ArrowRightIcon />
      </button>
    </div>
  );
}

function ScreenHeader({ screen }: { screen: WireframeScreen }) {
  const setupStep = screen.eyebrow.match(/(\d) of 3/);

  return (
    <header className="screen-header">
      <div className="brand-row">
        <div className="brand-lockup">
          <img
            src="/nexsteps-logo.svg"
            alt=""
            className="brand-logo"
            draggable={false}
          />
          <span>NexSteps Home</span>
        </div>
        {screen.tab ? (
          <span className="privacy-chip">
            {screen.tab === "Community" ? (
              <>
                <LockClosedIcon /> Adults only
              </>
            ) : (
              <>
                <CheckCircledIcon /> Family private
              </>
            )}
          </span>
        ) : null}
      </div>
      {setupStep ? (
        <div
          className="setup-progress"
          aria-label={`Setup step ${setupStep[1]} of 3`}
        >
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={
                step <= Number(setupStep[1])
                  ? "setup-progress-step is-complete"
                  : "setup-progress-step"
              }
            />
          ))}
        </div>
      ) : null}
      <p className="screen-eyebrow">{screen.eyebrow}</p>
      <h1>{screen.title}</h1>
      <p className="screen-description">{screen.description}</p>
    </header>
  );
}

function Block({
  block,
  onNavigate,
}: {
  block: WireframeBlock;
  onNavigate: (id: string) => void;
}) {
  switch (block.type) {
    case "notice":
      return (
        <article className={`notice-card tone-${block.tone ?? "mint"}`}>
          <NoticeIcon tone={block.tone} />
          <div>
            <h2>{block.title}</h2>
            <p>{block.body}</p>
          </div>
        </article>
      );
    case "card":
      return (
        <article className={`content-card tone-${block.tone ?? "neutral"}`}>
          <div className="card-heading-row">
            <h2>{block.title}</h2>
            {block.meta ? (
              <span className="meta-chip">{block.meta}</span>
            ) : null}
          </div>
          <p>{block.body}</p>
          {block.action ? (
            <button
              type="button"
              className="inline-action"
              onClick={() => block.target && onNavigate(block.target)}
            >
              {block.action} <ChevronRightIcon />
            </button>
          ) : null}
        </article>
      );
    case "fields":
      return (
        <section className="field-stack" aria-label="Form fields">
          {block.fields.map((field) => (
            <div className="field-group" key={field.label}>
              <span className="field-label">{field.label}</span>
              <div className="field-value">{field.value}</div>
              {field.helper ? (
                <span className="field-helper">{field.helper}</span>
              ) : null}
            </div>
          ))}
        </section>
      );
    case "chips":
      return (
        <section className="chip-group" aria-label={block.label}>
          {block.label ? <p className="block-label">{block.label}</p> : null}
          <div className="chip-row">
            {block.items.map((item) => (
              <span
                className={
                  block.active?.includes(item)
                    ? "choice-chip is-active"
                    : "choice-chip"
                }
                key={item}
              >
                {block.active?.includes(item) ? <CheckCircledIcon /> : null}
                {item}
              </span>
            ))}
          </div>
        </section>
      );
    case "list":
      return (
        <section className="list-card">
          {block.title ? <h2>{block.title}</h2> : null}
          {block.items.map((item) => (
            <button
              type="button"
              className="list-row"
              onClick={() => item.target && onNavigate(item.target)}
              key={item.title}
            >
              <span className="list-marker" aria-hidden="true" />
              <span className="list-copy">
                <strong>{item.title}</strong>
                {item.detail ? <span>{item.detail}</span> : null}
              </span>
              {item.meta ? (
                <span className="list-meta">{item.meta}</span>
              ) : null}
              <ChevronRightIcon />
            </button>
          ))}
        </section>
      );
    case "stats":
      return (
        <section className="stats-grid">
          {block.items.map((item) => (
            <article className="stat-card" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </section>
      );
    case "message":
      return (
        <article className={block.own ? "message-row is-own" : "message-row"}>
          <span className="message-avatar">
            <AvatarIcon />
          </span>
          <div className="message-bubble">
            <div>
              <strong>{block.sender}</strong>
              <span>{block.time}</span>
            </div>
            <p>{block.body}</p>
          </div>
        </article>
      );
    case "week":
      return (
        <section className="week-strip" aria-label="Family week">
          {block.days.map((day) => (
            <article
              className={
                day.day === block.activeDay ? "week-day is-active" : "week-day"
              }
              key={`${day.day}-${day.date}`}
            >
              <span>{day.day}</span>
              <strong>{day.date}</strong>
              <i>{day.count ?? "–"}</i>
            </article>
          ))}
        </section>
      );
  }
}

function NoticeIcon({ tone }: { tone?: Tone }) {
  if (tone === "yellow") return <BellIcon aria-hidden="true" />;
  if (tone === "blue") return <GlobeIcon aria-hidden="true" />;
  if (tone === "danger") return <Cross2Icon aria-hidden="true" />;
  if (tone === "neutral") return <FileTextIcon aria-hidden="true" />;
  return <CheckCircledIcon aria-hidden="true" />;
}

function ScreenActions({
  screen,
  onPrimary,
  onSecondary,
}: {
  screen: WireframeScreen;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  if (!screen.primaryAction && !screen.secondaryAction) return null;

  return (
    <section className="screen-actions">
      {screen.primaryAction ? (
        <button
          type="button"
          className="primary-button"
          onClick={onPrimary}
          disabled={!screen.primaryTarget}
        >
          {screen.primaryAction}
          <ArrowRightIcon />
        </button>
      ) : null}
      {screen.secondaryAction ? (
        <button
          type="button"
          className="secondary-button"
          onClick={onSecondary}
        >
          {screen.secondaryAction}
        </button>
      ) : null}
    </section>
  );
}

function BottomNavigation({
  active,
  onNavigate,
}: {
  active: AppTab;
  onNavigate: (tab: AppTab) => void;
}) {
  const tabs = Object.keys(tabIcons) as AppTab[];

  return (
    <nav className="bottom-navigation" aria-label="Primary app navigation">
      {tabs.map((tab) => {
        const Icon = tabIcons[tab];
        return (
          <button
            type="button"
            className={tab === active ? "bottom-tab is-active" : "bottom-tab"}
            aria-current={tab === active ? "page" : undefined}
            onClick={() => onNavigate(tab)}
            key={tab}
          >
            <Icon />
            <span>{tab}</span>
          </button>
        );
      })}
    </nav>
  );
}

function FlowIndex({
  activeId,
  onClose,
  onNavigate,
}: {
  activeId: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const groupedScreens = flowGroups.map((group) => ({
    ...group,
    screens: wireframeScreens.filter((screen) => screen.group === group.id),
  }));

  return (
    <main className="flow-index" data-testid="flow-index">
      <header className="flow-index-header">
        <div className="brand-lockup">
          <img
            src="/nexsteps-logo.svg"
            alt=""
            className="brand-logo"
            draggable={false}
          />
          <span>NexSteps Home</span>
        </div>
        <button
          type="button"
          className="review-icon-button"
          aria-label="Close all screens"
          onClick={onClose}
        >
          <Cross2Icon />
        </button>
        <p>Visual wireframe library</p>
        <h1>All {wireframeScreens.length} screens</h1>
        <p className="screen-description">
          Every listed feature is grouped into a clear parent and moderator
          flow.
        </p>
      </header>
      <section className="flow-index-groups">
        {groupedScreens.map((group) => (
          <article className="flow-group" key={group.id}>
            <div className="flow-group-heading">
              <div>
                <h2>{group.label}</h2>
                <p>{group.summary}</p>
              </div>
              <span>{group.screens.length}</span>
            </div>
            <div className="flow-screen-list">
              {group.screens.map((screen, index) => (
                <button
                  type="button"
                  className={
                    screen.id === activeId
                      ? "flow-screen-link is-active"
                      : "flow-screen-link"
                  }
                  onClick={() => onNavigate(screen.id)}
                  key={screen.id}
                >
                  <span>{index + 1}</span>
                  <span>
                    <strong>{screen.title}</strong>
                    <small>{screen.eyebrow}</small>
                  </span>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
