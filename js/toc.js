!function (a) {
    "use strict";
    a(function () {
        // 生成二级菜单
        var $header = a('.post-container').find('h2,h3');
        var _tagLevel = 2;                  // 最初的level
        var _$wrap = a('.bs-docs-sidenav');    // 最初的wrap
        $header.each(function (index) {
            a(this).attr('id', 'articleHeader' + index);      // 加id
            var _tl = parseInt(a(this)[0].tagName.slice(1));  // 当前的tagLevel
            var _$li = null;

            if (index === 0 || _tl === _tagLevel) {  // 第一个或者是与上一个相同
                _$li = a('<li><a href="#articleHeader' + index + '">' + a(this).text() + '</a></li>');
                _$wrap.append(_$li);

            } else if (_tl > _tagLevel) {  // 当前的大于上次的
                _$li = a('<ul class="nav" style="padding-left:10px;"><li><a href="#articleHeader' + index + '">' + a(this).text() + '</a></li></ul>');
                _$wrap.find('li').last().append(_$li);
                _$wrap = _$li;
            } else if (_tl < _tagLevel) {    // 当前的小于上次的
                _$li = a('<li><a href="#articleHeader' + index + '">' + a(this).text() + '</a></li>');
                // if(_tl === 1) {
                //     a('.bs-docs-sidenav').append(_$li);
                //     _$wrap = a('.bs-docs-sidenav');
                // } else {
                //     _$wrap.parent('ul').append(_$li);
                //     _$wrap = _$wrap.parent('ul');
                // }
                a('.bs-docs-sidenav').append(_$li);
                _$wrap = a('.bs-docs-sidenav');
            }

            _tagLevel = _tl;
        });

        var b = a(window), c = a(document.body);
        c.scrollspy({target: ".bs-docs-sidebar"});
        b.on("load", function () {
            c.scrollspy("refresh")
        });


        setTimeout(function () {
            var b = a(".bs-docs-sidebar");
            b.affix({
                offset: {
                    top: function () {
                        var c = b.offset().top, d = parseInt(b.children(0).css("margin-top"), 10), e = a(".bs-docs-nav").height();
                        return this.top = c - e - d
                    }, bottom: function () {
                        return this.bottom = a(".bs-docs-footer").outerHeight(!0)
                    }
                }
            })
        }, 100);

        setTimeout(function () {
            a(".bs-top").affix()
        }, 100);
    })
}(jQuery);