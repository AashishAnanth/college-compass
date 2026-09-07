/** Kept short. The detail lives in the README, where people who want it look. */
export function HowItWorks() {
  return (
    <div className="wrap how">
      <div className="cta">
        <a className="btn" href="https://github.com/AashishAnanth/college-compass#install-the-extension">
          Add to Chrome
        </a>
        <span className="ctanote">
          Reads the Canvas tab you&rsquo;re already signed into. No account, no
          access token, nothing stored on a server.
        </span>
      </div>

      <p className="fine">
        The courses above are sample data — invented courses, invented scores —
        so you can try it without installing anything. Your plans are kept in
        this browser only. Installed, it reads your own courses instead.
        {' '}
        <a href="https://github.com/AashishAnanth/college-compass">
          Source, and how the grading rules are modelled
        </a>.
      </p>
    </div>
  );
}
