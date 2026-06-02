import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'dburst-live-chat',
    template: '<div id="dburst-live-chat-widget"></div>',
    styles: [':host { display: block; }'],
    standalone: true,
    imports: [CommonModule],
})
export class LiveChatComponent implements OnInit {
  ngOnInit() {
    try {
      (function (w: any, d: Document, s: string, u: string) {
        w.RocketChat = function (c: any) {
          w.RocketChat._.push(c);
        };
        w.RocketChat._ = [];
        w.RocketChat.url = u;
        const h = d.getElementsByTagName(s)[0];
        const j = d.createElement(s) as HTMLScriptElement;
        j.async = true;
        j.src =
          'https://chat.datapallas.com/livechat/rocketchat-livechat.min.js?_=201903270000';
        h.parentNode?.insertBefore(j, h);
      })(window, document, 'script', 'https://chat.datapallas.com/livechat');
    } catch (error) {
      console.error('RocketChat widget error:', error);
    }
  }
}
