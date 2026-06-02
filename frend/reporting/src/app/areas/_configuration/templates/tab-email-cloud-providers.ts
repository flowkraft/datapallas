export const tabEmailCloudProvidersTemplate = `<ng-template #tabEmailCloudProvidersTemplate>
  <div class="overflow-y-auto" style="height: 600px;">

    <h5>
      <u><em>DataPallas</em> can be used with all the major cloud email providers.</u>
    </h5>

    <br>

    <div class="card border-primary">
      <div class="card-title">
        <h3>
          <a href="https://www.office.com" target="_blank">Office 365</a></h3>
      </div>
      <div class="card-body">
        <a href="https://www.office.com" target="_blank"><img src="assets/images/office365_32.png"></a> Welcome to <a
          href="https://www.office.com" target="_blank">Office</a>. Your place to create, communicate, collaborate, and
        get great work done.
        <br>
      </div>
    </div>

    <div class="card border-primary">
      <div class="card-title">
        <h3>
          <a href="https://gsuite.google.com" target="_blank">G Suite / Google Apps</a></h3>
      </div>
      <div class="card-body">
        <a href="https://gsuite.google.com" target="_blank"><img src="assets/images/gapps_32.png"></a> Do your best
        work with
        <a href="https://gsuite.google.com" target="_blank">Google's suite</a> of intelligent apps (formerly <a href="https://gsuite.google.com"
          target="_blank">Google Apps</a>). Get business email, video conferencing, online storage and file sharing.
      </div>
    </div>

    <div class="card border-primary">
      <div class="card-title">
        <h3>
          <a href="https://aws.amazon.com/ses/" target="_blank">Amazon Simple Email Service (Amazon SES)</a></h3>
      </div>
      <div class="card-body">
        <span style="margin-right:2px"><a href="https://aws.amazon.com/ses/" target="_blank"><svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="inline-block w-8 h-8 fill-current" style="color:gold"><title>Amazon</title><path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.09.48-.256.19-.54.358-.842.524a22.282 22.282 0 01-9.235 2.132c-3.629 0-7.018-.769-10.1-2.285-.298-.15-.588-.3-.876-.456-.186-.1-.218-.244-.132-.404zm-.87-2.798c.064-.063.203-.082.384-.016.7.362 1.44.682 2.22.96C4.1 17.31 6.38 17.81 8.697 17.81c4.084 0 8.187-.76 12.306-2.28l.272-.1c.14-.05.24-.082.31-.1.17-.046.308-.006.414.12.103.118.112.256.02.412-.115.17-.285.34-.51.51-2.97 2.16-6.19 3.24-9.655 3.24a20.1 20.1 0 01-8.665-1.898c-.22-.095-.425-.19-.617-.286-.145-.075-.19-.19-.12-.33zm11.065-9.8c0-1.18.326-2.12.98-2.82.653-.7 1.514-1.05 2.582-1.05.59 0 1.07.12 1.44.358.373.238.56.54.56.904 0 .243-.055.46-.166.65-.11.19-.254.34-.432.46-.178.12-.36.17-.547.15a.563.563 0 01-.397-.194.555.555 0 01-.15-.41c0-.21.075-.38.224-.51.15-.13.335-.197.555-.2.043-.004.07-.024.08-.062a.196.196 0 000-.134c-.04-.088-.116-.162-.225-.22a.97.97 0 00-.45-.093c-.456 0-.837.218-1.14.653-.305.435-.458 1.023-.458 1.764 0 .678.143 1.212.43 1.6.287.39.676.584 1.167.584.26 0 .517-.048.77-.145.252-.097.536-.27.852-.518a.39.39 0 01.235-.077.3.3 0 01.22.093c.063.063.095.143.095.24a.43.43 0 01-.16.33c-.355.295-.744.52-1.17.677a3.8 3.8 0 01-1.302.234c-1.015 0-1.84-.336-2.475-1.007-.636-.67-.954-1.548-.954-2.635z"/></svg></a></span>
        <a href="https://aws.amazon.com/ses/" target="_blank">Amazon Simple Email Service (Amazon SES)</a> evolved from
        the
        email platform that Amazon.com created to communicate with its own customers. In order to serve its
        ever-growing global
        customer base, Amazon.com needed to build an email platform that was flexible, scalable, reliable, and
        cost-effective.
        Amazon SES is the result of years of Amazon's own research, development, and iteration in the areas of sending
        and
        receiving email.
        <br><br> Amazon SES eliminates the complexity and expense of building an in-house email solution. There is no
        need
        to set up your own servers, maintain your network infrastructure, or warm up your sending IP addresses.
        <br><br> You can use the Amazon SES API to integrate the functionality of Amazon SES directly into applications
        you
        develop. Or you can use the Amazon SES SMTP interface to send email through the third-party applications you
        already
        use, such as email clients, ticketing systems, and autoresponders.
      </div>
    </div>

    <div class="card border-primary">
      <div class="card-title">
        <h3>
          <a href="https://www.mailgun.com" target="_blank">Mailgun</a></h3>
      </div>
      <div class="card-body">
        <a href="https://www.mailgun.com" target="_blank"><img src="assets/images/mailgun_32.png"> Send, receive and
          track email effortlessly. 10,000 emails free every month.</a>
      </div>
    </div>

    <div class="card border-primary">
      <div class="card-title">
        <h3>
          <a href="https://sendgrid.com" target="_blank">SendGrid</a></h3>
      </div>
      <div class="card-body">
        <a href="https://sendgrid.com" target="_blank"><img src="assets/images/sendgrid_32.png"></a> Email Delivery
        Service
        trusted by over 55,000 paying customers like Spotify, Uber, and Airbnb trust <a href="https://sendgrid.com"
          target="_blank">SendGrid</a> to send more than 30 billion emails every month.
      </div>
    </div>

    <div class="card border-primary">
      <div class="card-title">
        <h3>
          <a href="https://www.sparkpost.com" target="_blank">SparkPost</a></h3>
      </div>
      <div class="card-body">
        <a href="https://www.sparkpost.com" target="_blank"><img src="assets/images/sparkpost.png"></a> The World’s
        Fastest-Growing
        Email Delivery Service. When your enterprise counts on email, <a href="https://www.sparkpost.com" target="_blank">SparkPost</a>
        got you covered.
      </div>
    </div>


    <div class="card border-primary">
      <div class="card-title">
        <h3>
          <a href="http://mandrill.com" target="_blank">Mandrill</a></h3>
      </div>
      <div class="card-body">
        <a href="http://mandrill.com" target="_blank"><img src="assets/images/mandrill_32.png"> Mandrill</a> sends 20
        billion
        emails every month for more than 10 million users.
      </div>
    </div>

    <img src="assets/images/transactional-email-services.png">

  </div>
</ng-template>
`;
